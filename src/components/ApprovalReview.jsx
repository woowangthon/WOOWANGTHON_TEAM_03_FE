import { useEffect, useId, useMemo, useRef, useState } from "react";
import { requestApi } from "../api/services.js";
import { describeApiError } from "../api/http.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { detectionLabels, splitHighlights } from "../domain/requests.js";
import { Notice, Spinner } from "./Common.jsx";

const expiryFormat = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Seoul",
});
const sources = { instruction: "요청문", pdf: "PDF 본문" };
const expiryMessage = "승인 시간이 만료되었습니다.";

export default function ApprovalReview({ id, disabled, onDecision, onDenied }) {
  const auth = useAuth();
  const latest = useRef({ auth, onDenied });
  latest.current = { auth, onDenied };
  const markPrefix = useId();
  const [review, setReview] = useState({ state: "loading" });
  const [seconds, setSeconds] = useState(0);
  const preview = review.preview;
  const expiresAt = preview ? Date.parse(preview.expires_at) : null;
  const parts = useMemo(
    () => preview && splitHighlights(preview.input_text, preview.spans),
    [preview],
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const current = latest.current.auth;
    current
      .run(() =>
        requestApi.preview(current.user, id, { signal: controller.signal }),
      )
      .then((result) => {
        if (!active) return;
        const remaining = Date.parse(result.expires_at) - Date.now();
        if (remaining <= 0) {
          setReview({ state: "expired" });
          return;
        }
        setSeconds(Math.ceil(remaining / 1000));
        setReview({ state: "ready", preview: result });
      })
      .catch((error) => {
        if (!active) return;
        if (["FORBIDDEN", "REQUEST_NOT_FOUND"].includes(error.code)) {
          latest.current.onDenied(error);
          return;
        }
        if (error.code === "APPROVAL_EXPIRED") {
          setReview({ state: "expired" });
          return;
        }
        setReview({
          state: "error",
          message: controller.signal.aborted
            ? "검사 결과 확인 시간이 초과되었습니다."
            : describeApiError(error),
        });
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [id]);

  useEffect(() => {
    if (expiresAt === null) return;
    let timer;
    function updateCountdown() {
      clearTimeout(timer);
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        setReview({ state: "expired" });
        return;
      }
      setSeconds(Math.ceil(remaining / 1000));
      timer = setTimeout(updateCountdown, Math.min(1000, remaining));
    }
    updateCountdown();
    document.addEventListener("visibilitychange", updateCountdown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", updateCountdown);
    };
  }, [expiresAt]);

  function decide(decision) {
    if (disabled || !parts || review.state !== "ready") return;
    if (Date.now() >= expiresAt) {
      setReview({ state: "expired" });
      return;
    }
    setReview({ state: "submitting" });
    onDecision(decision);
  }

  if (review.state === "loading") return <Spinner>검사 결과 조회 중</Spinner>;
  if (review.state === "submitting") return <Spinner>선택 저장 중</Spinner>;
  if (review.state === "expired")
    return <Notice kind="warning">{expiryMessage}</Notice>;
  if (!parts)
    return (
      <Notice kind="error">
        {review.message || "탐지 위치를 확인할 수 없습니다."} 상태를 다시 조회해
        주세요.
      </Notice>
    );

  const markIndexes = parts.flatMap((part, index) =>
    part.label ? [index] : [],
  );
  const timeLeft = `${Math.floor(seconds / 60)}분 ${String(seconds % 60).padStart(2, "0")}초`;
  return (
    <section
      className="approval-review"
      aria-labelledby={markPrefix + "-title"}
    >
      <div className="approval-review-heading">
        <h2 id={markPrefix + "-title"}>외부 전송 확인</h2>
        <div className="approval-deadline">
          <strong>남은 시간 {timeLeft}</strong>
          <time dateTime={preview.expires_at}>
            {expiryFormat.format(expiresAt)} KST 만료
          </time>
        </div>
      </div>
      <p className="fine-print">
        검사 원문에 탐지된 구간을 표시했습니다. 승인하면 서버가 마스킹 정책에
        따라 외부 전송문을 구성합니다.
      </p>
      <div className="highlight-preview" aria-label="검사 원문">
        {parts.map((part, index) =>
          part.label ? (
            <mark
              key={index}
              id={markPrefix + "-" + index}
              tabIndex={-1}
              title={detectionLabels[part.label]}
            >
              {part.text}
            </mark>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </div>
      <h3>탐지 구간 {preview.detection_count.toLocaleString()}개</h3>
      {preview.spans.length ? (
        <ul className="approval-detections">
          {preview.spans.map((span, index) => (
            <li key={span.id}>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  document
                    .getElementById(markPrefix + "-" + markIndexes[index])
                    ?.focus()
                }
              >
                <strong>{detectionLabels[span.label]}</strong>
                <span>{sources[span.input_source]}</span>
                <span className="approval-detection-value">{span.text}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fine-print">
          탐지된 마스킹 대상이 없어 검사 원문을 가리지 않고 외부 AI로
          전송합니다. 전송하려면 승인이 필요합니다.
        </p>
      )}
      <div className="button-row approval-actions">
        <button
          type="button"
          className="secondary"
          disabled={disabled}
          onClick={() => decide("rejected")}
        >
          외부 전송 거절
        </button>
        <button
          type="button"
          className="primary"
          disabled={disabled}
          onClick={() => decide("approved")}
        >
          외부 전송 승인
        </button>
      </div>
    </section>
  );
}
