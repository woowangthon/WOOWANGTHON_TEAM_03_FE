export const stateLabels = {
  analyzing: "검사 중",
  awaiting_approval: "전송 확인 대기",
  processing: "답변 작성 중",
  completed: "완료",
  blocked: "정책 차단",
  rejected: "전송 거절",
  expired: "승인 만료",
  failed: "처리 실패",
};
export const terminalStates = new Set([
  "completed",
  "blocked",
  "rejected",
  "expired",
  "failed",
]);

export function validateInstruction(text) {
  if (!text.trim()) return "요청 내용을 입력해 주세요.";
  if ([...text].length > 4000) return "요청문은 4,000자 이내로 입력해 주세요.";
  return null;
}

export const detectionLabels = {
  company: "회사명",
  project: "사업명",
  doc_no: "문서·식별번호",
  price: "금액",
  person: "이름",
  contact: "연락처",
  biz_no: "사업자번호",
};

/** Render using UTF-16 offsets after the API layer converts server coordinates. */
export function splitHighlights(text, spans) {
  let cursor = 0;
  const parts = [];
  for (const span of spans) {
    if (
      !Number.isInteger(span.start) ||
      !Number.isInteger(span.end) ||
      span.start < cursor ||
      span.end <= span.start ||
      span.end > text.length ||
      text.slice(span.start, span.end) !== span.text
    )
      return null;
    if (span.start > cursor)
      parts.push({ text: text.slice(cursor, span.start) });
    parts.push({ text: span.text, label: span.label });
    cursor = span.end;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
