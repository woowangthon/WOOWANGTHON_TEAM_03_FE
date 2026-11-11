import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { requestApi } from "../api/services.js";
import { describeApiError } from "../api/http.js";
import { requestStateLabel, validateIntake } from "../api/requests.js";
import { Notice, Spinner } from "../components/Common.jsx";
import Icon from "../components/Icon.jsx";
import ApprovalReview from "../components/ApprovalReview.jsx";
import RequestResult from "../components/RequestResult.jsx";
import { terminalStates } from "../domain/requests.js";
import { useRequestStatus } from "../hooks/useRequestStatus.js";
import { processingRecovery } from "../api/processing.js";

const extractionLabels = {
  uploading: "업로드 중",
  pending: "추출 대기",
  extracting: "추출 중",
  ready: "추출 완료",
  failed: "추출 실패",
};
const processingMessages = {
  queued: "처리 순서를 기다리고 있습니다.",
  analyzing:
    "민감정보를 검사하고 있습니다. 문서 길이에 따라 시간이 걸릴 수 있습니다.",
  processing: "답변을 처리하고 있습니다.",
};

function RequestDetail({ id, onHistoryChange, onHistoryHidden }) {
  const auth = useAuth();
  const status = useRequestStatus(auth, id, onHistoryChange);
  const { data, loading } = status;
  const visibleRecord = useRef(data);
  visibleRecord.current = data;
  const setData = (next) => (next ? status.accept(next) : status.clear());
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [starting, setStarting] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const [hiding, setHiding] = useState(false);
  const mutation = useRef(false);
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
    if (data && (!instructionDirty.current || data.state !== "preparing")) {
      setInstruction(data.instruction);
      instructionDirty.current = false;
    }
    if (!data) {
      setConfirmHide(false);
      if (fileUrl.current) {
        URL.revokeObjectURL(fileUrl.current);
        fileUrl.current = null;
        setPdf(null);
      }
    }
  }, [data]);

  async function start() {
    if (
      mutation.current ||
      busy ||
      loading ||
      !data?.processing_available ||
      data.state !== "preparing" ||
      instruction !== data.instruction
    )
      return;
    mutation.current = true;
    status.pause();
    setBusy(true);
    setStarting(true);
    setError("");
    setMessage("");
    try {
      const next = await auth.run(() => requestApi.start(auth.user, id));
      if (!alive.current) return;
      status.accept(next);
      setMessage(
        "검사를 시작했습니다. 외부 전송이 필요한 경우 별도 승인을 받습니다.",
      );
      onHistoryChange();
      status.refresh();
    } catch (err) {
      if (!alive.current) return;
      setError(describeApiError(err));
      const recovery = processingRecovery(err);
      if (recovery === "refresh" || recovery === "unavailable") {
        // Require an explicit GET before allowing another start after uncertainty.
        status.clear();
        setMessage(
          "시작 요청은 자동으로 다시 보내지 않습니다. 상태 다시 조회로 결과를 확인해 주세요.",
        );
      }
    } finally {
      mutation.current = false;
      if (alive.current) {
        setBusy(false);
        setStarting(false);
      }
    }
  }

  function approvalDenied(err) {
    status.pause();
    status.clear();
    setMessage("");
    setError(describeApiError(err));
  }

  async function submitApproval(decision) {
    if (
      mutation.current ||
      busy ||
      loading ||
      data?.state !== "awaiting_approval"
    )
      return;
    mutation.current = true;
    status.pause();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await auth.run(() =>
        requestApi.decide(auth.user, id, decision, {
          signal: AbortSignal.timeout(15000),
        }),
      );
      if (!alive.current) return;
      status.accept({ ...data, state: result.state });
      setMessage(
        decision === "approved"
          ? "외부 전송 승인을 저장했습니다."
          : "외부 전송 거절을 저장했습니다.",
      );
      onHistoryChange();
      status.refresh();
    } catch (err) {
      if (!alive.current) return;
      approvalDenied(err);
      if (processingRecovery(err) === "refresh")
        setMessage("상태를 다시 조회해 저장 결과를 확인해 주세요.");
    } finally {
      mutation.current = false;
      if (alive.current) setBusy(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    if (busy || mutation.current || loading) return;
    const validation = validateIntake(instruction, null);
    if (validation) {
      setError(validation);
      return;
    }
    mutation.current = true;
    status.pause();
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
          [
            "REQUEST_NOT_EDITABLE",
            "DOCUMENT_NOT_READY",
            "FORBIDDEN",
            "REQUEST_NOT_FOUND",
          ].includes(err.code)
        ) {
          setData(null);
        }
      }
    } finally {
      mutation.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function loadPdf() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const blob = await auth.run(() => requestApi.file(auth.user, id));
      if (!alive.current || !visibleRecord.current) return;
      if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
      fileUrl.current = URL.createObjectURL(blob);
      setPdf(fileUrl.current);
    } catch (err) {
      if (alive.current) {
        setError(describeApiError(err));
        if (
          ["FORBIDDEN", "REQUEST_NOT_FOUND", "DOCUMENT_NOT_FOUND"].includes(
            err.code,
          )
        ) {
          status.pause();
          status.clear();
        }
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function hideRequest() {
    if (!confirmHide || !data || loading || busy || mutation.current) return;
    mutation.current = true;
    status.pause();
    setBusy(true);
    setHiding(true);
    setError("");
    setMessage("");
    try {
      await auth.run(() =>
        requestApi.hide(auth.user, id, { signal: AbortSignal.timeout(15000) }),
      );
      // Update history even if the user moved to another screen during the POST.
      onHistoryHidden(id);
    } catch (err) {
      const recovery = processingRecovery(err);
      if (recovery === "refresh" || recovery === "unavailable")
        onHistoryChange();
      if (!alive.current) return;
      setError(describeApiError(err));
      if (recovery === "refresh" || recovery === "unavailable") {
        status.clear();
        if (recovery === "refresh")
          setMessage("목록과 현재 상태를 확인한 뒤 다시 시도해 주세요.");
      } else if (recovery !== "session") {
        status.refresh();
      }
    } finally {
      mutation.current = false;
      if (alive.current) {
        setConfirmHide(false);
        setHiding(false);
        setBusy(false);
      }
    }
  }
  return (
    <section className="response-card intake-detail">
      <div className="response-heading">
        <span className="avatar-small">동</span>
        <strong>의뢰 상세</strong>
        {data && (
          <span className={`state-tag ${data.state}`}>
            {requestStateLabel(data.state)}
          </span>
        )}
      </div>
      {loading && <Spinner>접수한 의뢰를 불러오는 중</Spinner>}
      <Notice kind="error">{error}</Notice>
      <Notice kind="error">{status.error}</Notice>
      <Notice>{message}</Notice>
      {!loading && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setMessage("");
            setError("");
            status.refresh();
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
          {data.state === "preparing" && (
            <Notice>
              접수한 내용을 확인한 뒤 검사를 시작해 주세요. PDF만 접수했다면
              요청문을 먼저 저장해 주세요.
            </Notice>
          )}
          {["queued", "analyzing", "processing"].includes(data.state) && (
            <>
              <Notice kind={status.waiting.paused ? "warning" : "info"}>
                {status.waiting.paused
                  ? "5분 동안 처리 완료를 확인하지 못해 자동 조회를 멈췄습니다. 표시된 상태는 마지막 조회 결과입니다. 서버에서 처리가 계속될 수 있으니 상태 다시 조회로 결과를 확인해 주세요."
                  : `${processingMessages[data.state]} 상태를 자동으로 확인합니다.`}
              </Notice>
              <p className="fine-print" aria-live="off">
                상태 확인을 시작한 뒤 {Math.floor(status.waiting.seconds / 60)}
                분 {status.waiting.seconds % 60}초가 지났습니다.
              </p>
            </>
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
                disabled={busy || loading}
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
                    loading ||
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
          {data.state === "preparing" && (
            <div className="intake-edit">
              <button
                type="button"
                className="primary"
                onClick={start}
                disabled={
                  busy ||
                  loading ||
                  !data.processing_available ||
                  instruction !== data.instruction
                }
              >
                {starting ? "검사 시작 중…" : "검사 시작"}
              </button>
              {instruction !== data.instruction && (
                <p className="fine-print">
                  수정한 요청문을 저장한 뒤 검사를 시작할 수 있습니다.
                </p>
              )}
              {!data.processing_available && data.instruction && (
                <p className="fine-print">
                  아직 검사를 시작할 수 없습니다. 상태를 다시 조회해 주세요.
                </p>
              )}
            </div>
          )}
          {data.state === "awaiting_approval" && !loading && (
            <ApprovalReview
              id={id}
              disabled={busy}
              onDecision={submitApproval}
              onDenied={approvalDenied}
            />
          )}
          {terminalStates.has(data.state) && (
            <RequestResult
              key={data.state}
              state={data.state}
              answer={data.answer_text}
              disabled={busy || loading}
            />
          )}
          <div className="intake-edit">
            {confirmHide ? (
              <>
                <p>
                  목록에서 숨기면 이 의뢰의 상세 화면도 다시 열 수 없습니다.
                  서버 원본과 관리자 감사 기록은 보관됩니다.
                </p>
                {["queued", "analyzing", "processing"].includes(data.state) && (
                  <p className="fine-print">이미 시작된 처리는 계속됩니다.</p>
                )}
                {data.state === "awaiting_approval" && (
                  <p className="fine-print">
                    숨기면 이 의뢰의 외부 전송을 승인하거나 거절할 수 없습니다.
                  </p>
                )}
                <div className="button-row">
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => setConfirmHide(false)}
                  >
                    돌아가기
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={busy || loading}
                    onClick={hideRequest}
                  >
                    {hiding ? "숨기는 중…" : "숨기기 확인"}
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className="text-button"
                disabled={busy || loading}
                onClick={() => setConfirmHide(true)}
              >
                목록에서 숨기기
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default function IntakeWorkspace({
  selectedId,
  onSelect,
  onHistoryChange,
  onHistoryHidden,
  historyHidden,
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
  const composing = useRef(false);
  const dragDepth = useRef(0);
  const [dragActive, setDragActive] = useState(false);
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
    dragDepth.current = 0;
    setDragActive(false);
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
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files?.length) attachFiles(files);
  }
  function attachFiles(files) {
    if (busy || attempt || submitting.current) return;
    if (files.length !== 1) {
      setError("PDF 파일 1개만 선택해 주세요.");
      return;
    }
    const selected = files[0];
    const validation = validateIntake("", selected);
    if (validation) {
      setError(validation);
      return;
    }
    setFile(selected);
    setError("");
  }
  function dragEnter(event) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current += 1;
    if (!busy && !attempt && !submitting.current) setDragActive(true);
  }
  function dragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragActive(false);
  }
  function dragOver(event) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = busy || attempt ? "none" : "copy";
  }
  function drop(event) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragActive(false);
    attachFiles(event.dataTransfer.files);
  }
  function submitOnEnter(event) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      composing.current ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    )
      return;
    event.preventDefault();
    if (!event.repeat && !busy && !attempt && !submitting.current)
      event.currentTarget.form.requestSubmit();
  }
  return (
    <div className="workspace intake-workspace">
      <div className="conversation">
        {selectedId ? (
          <RequestDetail
            key={selectedId}
            id={selectedId}
            onHistoryChange={onHistoryChange}
            onHistoryHidden={onHistoryHidden}
          />
        ) : (
          <section className="welcome">
            {historyHidden && <Notice>내 요청 목록에서 숨겼습니다.</Notice>}
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
              접수 후 내용을 확인하고 검사를 시작할 수 있습니다. 외부 전송이
              필요한 요청은 검사 결과를 확인한 뒤 승인해 주세요.
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
            <Icon name="add" /> 새 요청 작성
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
            <form
              className={`composer${dragActive ? " drag-active" : ""}`}
              onSubmit={submit}
              onDragEnter={dragEnter}
              onDragLeave={dragLeave}
              onDragOver={dragOver}
              onDrop={drop}
            >
              {dragActive && (
                <p className="drop-prompt" role="status">
                  PDF 파일 1개를 놓아 첨부하세요.
                </p>
              )}
              {file && (
                <div className="file-chip">
                  <span>
                    <Icon name="picture_as_pdf" /> {file.name}{" "}
                    <small>{file.size.toLocaleString()}바이트</small>
                  </span>
                  <button
                    type="button"
                    aria-label="첨부 제거"
                    disabled={busy || !!attempt}
                    onClick={() => setFile(null)}
                  >
                    <Icon name="close" />
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
                onKeyDown={submitOnEnter}
                onCompositionStart={() => {
                  composing.current = true;
                }}
                onCompositionEnd={() => {
                  composing.current = false;
                }}
                aria-describedby="intake-input-help"
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
                  <Icon name="attach_file" /> <span>PDF 첨부</span>
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
            <p className="composer-caption" id="intake-input-help">
              Enter로 접수 · Shift+Enter로 줄바꿈 · PDF를 입력창에 끌어 첨부
            </p>
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
