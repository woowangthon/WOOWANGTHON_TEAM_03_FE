import { useState } from "react";
import { Notice } from "./Common.jsx";
import MarkdownAnswer from "./MarkdownAnswer.jsx";
import Icon from "./Icon.jsx";

const outcomes = {
  blocked: "보안 정책에 따라 요청을 차단했습니다.",
  rejected: "외부 전송을 거절해 요청이 종료되었습니다.",
  expired: "승인 시간이 지나 요청이 종료되었습니다.",
  failed: "요청 처리를 완료하지 못했습니다.",
};

export default function RequestResult({ state, answer, disabled, children }) {
  const [copyResult, setCopyResult] = useState("");

  if (state !== "completed")
    return (
      <Notice kind={state === "failed" ? "error" : "warning"}>
        {outcomes[state]} 다시 진행하려면 새 요청을 작성해 주세요.
      </Notice>
    );

  if (typeof answer !== "string" || !answer.trim())
    return (
      <Notice kind="error">
        답변을 불러오지 못했습니다. 상태를 다시 조회해 주세요.
      </Notice>
    );

  async function copyAnswer() {
    try {
      await navigator.clipboard.writeText(answer);
      setCopyResult("답변을 복사했습니다.");
    } catch {
      setCopyResult(
        "답변을 복사하지 못했습니다. 본문을 선택해서 복사해 주세요.",
      );
    }
  }

  return (
    <div className="answer">
      <MarkdownAnswer>{answer}</MarkdownAnswer>
      <div className="answer-actions">
        <button
          type="button"
          className="icon-button"
          aria-label="답변 복사"
          title="답변 복사"
          disabled={disabled}
          onClick={copyAnswer}
        >
          <Icon name="content_copy" />
        </button>
        {children}
      </div>
      {copyResult && (
        <p className="fine-print" role="status">
          {copyResult}
        </p>
      )}
    </div>
  );
}
