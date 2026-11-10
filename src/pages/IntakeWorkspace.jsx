import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { requestApi } from "../api/services.js";
import { describeApiError } from "../api/http.js";
import { requestStateLabel, validateIntake } from "../api/requests.js";
import { Notice, Spinner } from "../components/Common.jsx";

const extractionLabels = {
  uploading: "업로드 중",
  pending: "추출 대기",
  extracting: "추출 중",
  ready: "추출 완료",
  failed: "추출 실패",
};

function RequestDetail({ id, onHistoryChange }) {
  const auth = useAuth();
  const [data, setData] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);
  const [pdf, setPdf] = useState(null);
  const alive = useRef(true);
  const fileUrl = useRef(null);
  const instructionDirty = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setData(null);
    setError("");
    auth
      .run(() => requestApi.get(auth.user, id, { signal: controller.signal }))
      .then((next) => {
        if (active) {
          setData(next);
          if (!instructionDirty.current) setInstruction(next.instruction);
        }
      })
      .catch((err) => {
        if (active && err.name !== "AbortError")
          setError(describeApiError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [id, version]);

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    const validation = validateIntake(instruction, null);
    if (validation) {
      setError(validation);
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await auth.run(() =>
        requestApi.updateInstruction(auth.user, id, instruction),
      );
      if (!alive.current) return;
      setData(next);
      setInstruction(next.instruction);
      instructionDirty.current = false;
      setMessage(
        "같은 의뢰에 요청문을 저장했습니다. AI 처리는 시작하지 않았습니다.",
      );
      onHistoryChange();
    } catch (err) {
      if (alive.current) {
        setError(describeApiError(err));
        // Re-read after an uncertain PATCH instead of repeating the mutation.
        if (
          err.status >= 500 ||
          ["NETWORK_ERROR", "INVALID_RESPONSE"].includes(err.code)
        ) {
          try {
            const current = await auth.run(() => requestApi.get(auth.user, id));
            if (!alive.current) return;
            setData(current);
            if (current.instruction === instruction) {
              instructionDirty.current = false;
              setError("");
              setMessage("서버에서 요청문 저장을 확인했습니다.");
              onHistoryChange();
            } else
              setMessage(
                "서버에서는 이전 요청문이 조회됩니다. 작성한 내용은 보존했으니 상태를 확인한 뒤 다시 저장해 주세요.",
              );
          } catch {
            if (alive.current) setData(null);
          }
        } else if (
          ["REQUEST_NOT_EDITABLE", "DOCUMENT_NOT_READY"].includes(err.code)
        ) {
          setData(null);
        }
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function loadPdf() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const blob = await auth.run(() => requestApi.file(auth.user, id));
      if (!alive.current) return;
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
      fileUrl.current = URL.createObjectURL(blob);
      setPdf(fileUrl.current);
    } catch (err) {
      if (alive.current) setError(describeApiError(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <section className="response-card intake-detail">
      <div className="response-heading">
        <span className="avatar-small">동</span>
        <strong>의뢰 상세</strong>
        {data && (
          <span className="state-tag">{requestStateLabel(data.state)}</span>
        )}
      </div>
      {loading && <Spinner>접수한 의뢰를 불러오는 중</Spinner>}
      <Notice kind="error">{error}</Notice>
      <Notice>{message}</Notice>
      {!loading && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setMessage("");
            setVersion((v) => v + 1);
          }}
        >
          상태 다시 조회
        </button>
      )}
      {data && (
        <>
          <p className="fine-print request-id">접수 번호 {data.id}</p>
          <div className="request-bubble">
            <span className="eyebrow">접수한 요청문</span>
            <p>{data.instruction || "요청문을 아직 추가하지 않았습니다."}</p>
          </div>
          {!data.processing_available && (
            <Notice>
              의뢰는 서버에 저장됐습니다. 현재 화면에서는 PDF 추출·AI 처리와
              외부 전송을 실행하지 않습니다.
            </Notice>
          )}
          {data.document && (
            <div className="document-card">
              <h2>첨부한 PDF</h2>
              <strong className="file-name">
                {data.document.original_filename}
              </strong>
              <p className="fine-print">
                {Number.isFinite(data.document.size_bytes)
                  ? `${data.document.size_bytes.toLocaleString()}바이트`
                  : "크기 확인 대기"}{" "}
                ·{" "}
                {data.document.page_count == null
                  ? "쪽 수 확인 대기"
                  : `${data.document.page_count}쪽`}{" "}
                ·{" "}
                {extractionLabels[data.document.extraction_status] ||
                  "추출 상태 확인 필요"}
              </p>
              <button className="secondary" disabled={busy} onClick={loadPdf}>
                {busy ? "처리 중…" : "PDF 원본 보기"}
              </button>
              {pdf && (
                <>
                  <a
                    className="text-button pdf-download"
                    href={pdf}
                    download={data.document.original_filename}
                  >
                    PDF 원본 다운로드
                  </a>
                  <iframe
                    className="pdf-preview"
                    title="접수한 PDF 원본"
                    src={pdf}
                  />
                  <p className="fine-print">
                    미리보기가 표시되지 않으면 PDF 원본 다운로드를 이용해
                    주세요.
                  </p>
                </>
              )}
            </div>
          )}
          {data.state === "preparing" && (
            <form className="intake-edit" onSubmit={save}>
              <label htmlFor="saved-instruction">
                {data.instruction ? "요청문 수정" : "이 의뢰에 요청문 추가"}
              </label>
              <textarea
                id="saved-instruction"
                rows={4}
                value={instruction}
                disabled={busy}
                onChange={(e) => {
                  instructionDirty.current = true;
                  setInstruction(e.target.value);
                }}
              />
              <div className="button-row">
                <span className="fine-print">
                  {[...instruction].length.toLocaleString()} / 4,000자
                </span>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !instruction.trim() ||
                    [...instruction].length > 4000
                  }
                >
                  {busy ? "저장 중…" : "요청문 저장"}
                </button>
              </div>
              <p className="fine-print">
                준비 중인 의뢰에 저장합니다. PDF 교체는 새 요청에서 진행해
                주세요.
              </p>
            </form>
          )}
          {data.state === "awaiting_approval" && (
            <Notice kind="warning">
              전송 확인 대기 상태입니다. 실제 마스킹 확인·승인 화면은 다음 연결
              단계입니다.
            </Notice>
          )}
          {data.state === "completed" && data.answer_text && (
            <div className="answer">
              <h2>서버에 저장된 답변</h2>
              <p>{data.answer_text}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function IntakeWorkspace({
  selectedId,
  onSelect,
  onHistoryChange,
  draft,
  setDraft,
}) {
  const auth = useAuth();
  const { text, file, attempt, failureCode } = draft;
  const setText = (text) => setDraft((current) => ({ ...current, text }));
  const setFile = (file) => setDraft((current) => ({ ...current, file }));
  const setAttempt = (attempt) =>
    setDraft((current) => ({ ...current, attempt }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const selection = useRef(selectedId);
  selection.current = selectedId;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const validation = validateIntake(text, file);
    if (validation) {
      setError(validation);
      return;
    }
    // Keep the original bytes and text with the same key until success is known.
    const submission = attempt || {
      key: crypto.randomUUID(),
      instruction: text,
      file,
    };
    setAttempt(submission);
    submitting.current = true;
    setBusy(true);
    setError("");
    setDraft((current) => ({ ...current, failureCode: "" }));
    try {
      const result = await auth.run(() =>
        requestApi.create(auth.user, submission),
      );
      if (!mounted.current) return;
      setAttempt(null);
      setText("");
      setFile(null);
      if (!selection.current) onSelect(result.id);
      onHistoryChange();
    } catch (err) {
      if (mounted.current) {
        setError(describeApiError(err));
        setDraft((current) => ({ ...current, failureCode: err.code }));
        // Rejected inputs did not create an intake. Unknown outcomes keep the key.
        if (
          err.status >= 400 &&
          err.status < 500 &&
          ![408, 409, 429].includes(err.status)
        )
          setAttempt(null);
      }
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function attach(event) {
    const files = event.target.files;
    const selected = files?.[0];
    const count = files?.length || 0;
    event.target.value = "";
    if (!selected) return;
    if (count > 1) {
      setError("PDF 파일 1개만 선택해 주세요.");
      return;
    }
    const validation = validateIntake("", selected);
    if (validation) {
      setError(validation);
      return;
    }
    setFile(selected);
    setError("");
  }
  return (
    <div className="workspace intake-workspace">
      <div className="conversation">
        {selectedId ? (
          <RequestDetail
            key={selectedId}
            id={selectedId}
            onHistoryChange={onHistoryChange}
          />
        ) : (
          <section className="welcome">
            <span className="welcome-mark" aria-hidden="true">
              ✳
            </span>
            <span className="eyebrow">함께 일하는 안전한 AI</span>
            <h1>
              어떤 일을
              <br />
              도와드릴까요?
            </h1>
            <p>
              요청문을 적거나 PDF를 첨부해 주세요.
              <br />
              PDF를 먼저 접수한 뒤 요청문을 추가할 수도 있습니다.
            </p>
            <Notice>
              현재 의뢰 접수·조회가 연결되어 있습니다. PDF 추출과 AI 처리 기능은
              준비 중입니다.
            </Notice>
          </section>
        )}
      </div>
      <div className="composer-wrap">
        {selectedId ? (
          <button
            className="secondary new-bottom"
            onClick={() => onSelect(null)}
          >
            ＋ 새 요청 작성
          </button>
        ) : (
          <>
            <Notice kind="error">{error}</Notice>
            {attempt && !busy && (
              <Notice kind="warning">
                접수 결과를 확정하지 못했습니다. 입력을 유지한 채 같은 접수
                번호로 다시 확인해 주세요. 새로고침하면 이 확인 정보가
                사라지므로 최근 요청도 확인해 주세요.
              </Notice>
            )}
            {attempt &&
              !busy &&
              ["REQUEST_KEY_CONFLICT", "REQUEST_NOT_AVAILABLE"].includes(
                failureCode,
              ) && (
                <div className="intake-recovery">
                  <p className="fine-print">
                    이 접수 번호로는 계속할 수 없습니다. 최근 요청을 확인한 뒤
                    새 접수 번호로 작성할 수 있습니다.
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setDraft((current) => ({
                        ...current,
                        attempt: null,
                        failureCode: "",
                      }));
                      setError("");
                    }}
                  >
                    새 접수 번호로 작성
                  </button>
                </div>
              )}
            <form className="composer" onSubmit={submit}>
              {file && (
                <div className="file-chip">
                  <span>
                    ▤ {file.name}{" "}
                    <small>{file.size.toLocaleString()}바이트</small>
                  </span>
                  <button
                    type="button"
                    aria-label="첨부 제거"
                    disabled={busy || !!attempt}
                    onClick={() => setFile(null)}
                  >
                    ×
                  </button>
                </div>
              )}
              <label className="sr-only" htmlFor="intake-instruction">
                요청 내용
              </label>
              <textarea
                id="intake-instruction"
                rows={3}
                value={text}
                disabled={busy || !!attempt}
                onChange={(e) => setText(e.target.value)}
                placeholder="동료에게 부탁할 일을 적어 주세요"
              />
              <div className="composer-tools">
                <input
                  hidden
                  type="file"
                  id="intake-pdf"
                  accept="application/pdf,.pdf"
                  disabled={busy || !!attempt}
                  onChange={attach}
                />
                <label className="attach-button" htmlFor="intake-pdf">
                  ＋ <span>PDF 첨부</span>
                </label>
                <span className="character-count">
                  {[...text].length.toLocaleString()} / 4,000
                </span>
                <button
                  className="primary"
                  disabled={
                    busy || (!text.trim() && !file) || [...text].length > 4000
                  }
                >
                  {busy
                    ? "접수 중…"
                    : attempt
                      ? "같은 접수 번호로 확인"
                      : "의뢰 접수"}
                </button>
              </div>
            </form>
            <p className="composer-caption">
              PDF 1개 · 10MB(10,000,000바이트) · 20쪽 이하. 암호 PDF는 지원하지
              않습니다. 스캔 PDF의 본문 인식은 이 접수 단계에서 확인하지
              않습니다.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
