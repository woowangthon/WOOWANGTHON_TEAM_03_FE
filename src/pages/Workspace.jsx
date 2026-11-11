import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { requestApi, requestMode } from "../api/services.js";
import { scenarios } from "../api/mockRequests.js";
import {
  splitHighlights,
  stateLabels,
  terminalStates,
  validateInstruction,
} from "../domain/requests.js";
import { Empty, Notice, Spinner } from "../components/Common.jsx";
import MarkdownAnswer from "../components/MarkdownAnswer.jsx";

export default function Workspace({ selectedId, onSelect, onHistoryChange }) {
  const auth = useAuth();
  const [request, setRequest] = useState(null);
  const [text, setText] = useState("");
  const [scenario, setScenario] = useState("external");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const mutationVersion = useRef(0);
  const input = useRef();
  const selection = useRef(selectedId);
  selection.current = selectedId;

  useEffect(() => {
    setRequest(null);
    setError("");
    setCopied(false);
  }, [selectedId]);

  useEffect(() => {
    let active = true;
    let timer;
    const version = mutationVersion.current;
    if (!selectedId) return;
    async function poll() {
      try {
        const data = await auth.run(() =>
          requestApi.get(auth.user, selectedId),
        );
        if (!active || version !== mutationVersion.current) return;
        setRequest(data);
        setError("");
        onHistoryChange();
        if (!terminalStates.has(data.state)) timer = setTimeout(poll, 2000);
      } catch (error) {
        if (!active || version !== mutationVersion.current) return;
        setError(error.message);
        if (
          ["FORBIDDEN", "AUTH_REQUIRED", "API_NOT_READY"].includes(
            error.code,
          ) ||
          [403, 404].includes(error.status)
        )
          setRequest(null);
        else timer = setTimeout(poll, 5000);
      }
    }
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // Only the selected request owns this polling lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, auth.user.id, pollVersion]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const validation = validateInstruction(text);
    if (validation) {
      setError(validation);
      return;
    }
    if (file) {
      setError(
        "PDF 추출 연결은 다음 단계입니다. 지금은 예시 요청문으로 화면을 확인할 수 있습니다.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const data = await auth.run(() =>
        requestApi.create(auth.user, text, scenario),
      );
      onSelect(data.id);
      setText("");
      onHistoryChange();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function decide(approved) {
    if (busy || !request) return;
    const key = request.id;
    mutationVersion.current++;
    setBusy(true);
    setError("");
    try {
      const data = await auth.run(() =>
        requestApi.approve(auth.user, key, approved),
      );
      if (selection.current === key) setRequest(data);
      onHistoryChange();
    } catch (error) {
      if (selection.current === key) {
        setError(error.message);
        setRequest(null);
      }
    } finally {
      setBusy(false);
      setPollVersion((v) => v + 1);
    }
  }
  function attach(event) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;
    if (!picked.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF 파일 1개만 선택해 주세요.");
      return;
    }
    if (picked.size > 10 * 1024 * 1024) {
      setError(
        "10MB 이하의 PDF를 선택해 주세요. 정확한 서버 크기 기준은 연동 시 맞춥니다.",
      );
      return;
    }
    setFile(picked);
    setError("");
  }
  const parts = request?.spans
    ? splitHighlights(request.instruction, request.spans)
    : null;
  return (
    <div className="workspace">
      <div className="conversation">
        {!selectedId ? (
          <section className="welcome">
            <span className="welcome-mark" aria-hidden="true">
              ✳
            </span>
            <span className="eyebrow">함께 일하는 안전한 AI</span>
            <h1>
              오늘은 어떤 일을
              <br />
              도와드릴까요?
            </h1>
            <p>
              요청을 작성하면 민감정보를 먼저 살펴봅니다.
              <br />
              외부 전송은 내용을 확인한 뒤 직접 승인하세요.
            </p>
            {requestMode === "mock" && (
              <>
                <div className="section-label">
                  화면 흐름 체험 <span>가상 예시 · 실제 AI 호출 없음</span>
                </div>
                <div className="scenario-grid">
                  {scenarios.slice(0, 3).map((s, i) => (
                    <button
                      key={s.id}
                      className="scenario-card"
                      onClick={() => {
                        setText(s.instruction);
                        setScenario(s.id);
                        setFile(null);
                        input.current?.focus();
                      }}
                    >
                      <span className="card-number">0{i + 1}</span>
                      <strong>{s.title}</strong>
                      <span>{s.subtitle}</span>
                      <span className="card-arrow">↗</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        ) : !request ? (
          <Spinner>요청을 불러오는 중</Spinner>
        ) : (
          <>
            <div className="request-bubble">
              <span className="eyebrow">내 요청</span>
              <p>{request.instruction}</p>
            </div>
            <section className="response-card">
              <div className="response-heading">
                <span className="avatar-small">동</span>
                <strong>동료</strong>
                <span className={`state-tag ${request.state}`}>
                  {stateLabels[request.state]}
                </span>
              </div>
              {["analyzing", "processing"].includes(request.state) && (
                <Spinner>
                  {request.state === "analyzing"
                    ? "민감정보를 확인하는 중입니다"
                    : "예시 답변을 준비하고 있습니다"}
                </Spinner>
              )}
              {request.state === "awaiting_approval" && (
                <>
                  <h2>외부로 보내기 전에 확인해 주세요</h2>
                  <p className="muted">
                    표시된 정보는 가린 뒤 전송합니다. 탐지된 정보가 없어도
                    승인이 필요합니다.
                  </p>
                  {request.scenario === "warning" && (
                    <Notice kind="warning">
                      지시 삽입 의심 문구가 포함된 예시입니다. 가림 정책은
                      유지됩니다.
                    </Notice>
                  )}
                  {parts ? (
                    <div className="highlight-preview">
                      {parts.map((part, i) =>
                        part.label ? (
                          <mark key={i} title={part.label}>
                            {part.text}
                            <small>{part.label}</small>
                          </mark>
                        ) : (
                          <span key={i}>{part.text}</span>
                        ),
                      )}
                    </div>
                  ) : (
                    <Notice kind="error">
                      강조 위치를 확인하지 못했습니다. 전송할 수 없습니다.
                    </Notice>
                  )}
                  <p className="fine-print">
                    가릴 구간 {request.spans.length}개 ·{" "}
                    {new Date(request.expiresAt).toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    까지 확인 가능
                  </p>
                  <div className="button-row">
                    <button
                      className="primary"
                      disabled={busy || !parts}
                      onClick={() => decide(true)}
                    >
                      가리고 보내기
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => decide(false)}
                    >
                      전송 거절
                    </button>
                  </div>
                </>
              )}
              {request.state === "completed" && (
                <>
                  <div className="route-note">
                    {request.scenario === "local"
                      ? "사내 처리 예시 · 외부 미전송"
                      : "외부 처리 예시 · 실제 전송 없음"}
                  </div>
                  <MarkdownAnswer>{request.answer}</MarkdownAnswer>
                  <button
                    className="text-button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(request.answer);
                        setCopied(true);
                      } catch {
                        setError(
                          "복사하지 못했습니다. 답변을 직접 선택해 복사해 주세요.",
                        );
                      }
                    }}
                  >
                    {copied ? "복사했어요" : "답변 복사"}
                  </button>
                </>
              )}
              {["blocked", "rejected", "expired", "failed"].includes(
                request.state,
              ) && (
                <Empty
                  title={
                    {
                      blocked: "외부 전송이 제한됐습니다",
                      rejected: "전송하지 않고 종료했습니다",
                      expired: "승인 시간이 지났습니다",
                      failed: "검사를 완료하지 못했습니다",
                    }[request.state]
                  }
                >
                  {
                    {
                      blocked:
                        "민감정보를 한꺼번에 전송하는 가상 차단 사례입니다.",
                      rejected: "요청한 내용은 외부로 전송되지 않았습니다.",
                      expired: "새 요청에서 내용을 다시 확인해 주세요.",
                      failed:
                        "불완전한 검사 결과로 전송하지 않습니다. 새 요청을 작성해 주세요.",
                    }[request.state]
                  }
                </Empty>
              )}
            </section>
          </>
        )}
        <Notice kind="error">{error}</Notice>
      </div>
      <div className="composer-wrap">
        {selectedId ? (
          <button
            className="secondary new-bottom"
            onClick={() => {
              onSelect(null);
              setRequest(null);
              setFile(null);
              setText("");
            }}
          >
            ＋ 새 요청 작성
          </button>
        ) : (
          <form className="composer" onSubmit={submit}>
            {file && (
              <div className="file-chip">
                <span>
                  ▤ {file.name} <small>추출 연결 준비 중</small>
                </span>
                <button
                  type="button"
                  aria-label="첨부 제거"
                  onClick={() => setFile(null)}
                >
                  ×
                </button>
              </div>
            )}
            <label className="sr-only" htmlFor="instruction">
              요청 내용
            </label>
            <textarea
              ref={input}
              id="instruction"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="동료에게 부탁할 일을 적어 주세요"
              rows={3}
            />
            <div className="composer-tools">
              <input
                hidden
                type="file"
                id="pdf"
                accept="application/pdf,.pdf"
                onChange={attach}
              />
              <label className="attach-button" htmlFor="pdf">
                ＋ <span>PDF 첨부</span>
              </label>
              {requestMode === "mock" && (
                <select
                  aria-label="예시 시나리오"
                  value={scenario}
                  onChange={(e) => {
                    const s = scenarios.find((s) => s.id === e.target.value);
                    setScenario(s.id);
                    setText(s.instruction);
                  }}
                >
                  <option disabled>예시 선택</option>
                  {scenarios.map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.title}
                    </option>
                  ))}
                </select>
              )}
              <span className="character-count">
                {[...text].length.toLocaleString()} / 4,000
              </span>
              <button
                className="send-button"
                disabled={
                  busy || !text.trim() || !!file || [...text].length > 4000
                }
                aria-label="검사 시작"
              >
                {busy ? "…" : "↑"}
              </button>
            </div>
          </form>
        )}
        <p className="composer-caption">
          각 요청은 독립적으로 처리됩니다.{" "}
          {requestMode === "mock"
            ? "현재 예시는 화면 검증용이며 새로고침 시 초기화됩니다."
            : "실제 업무 API 연결을 준비 중입니다."}
        </p>
      </div>
    </div>
  );
}
