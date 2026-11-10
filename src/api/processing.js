import { ApiError } from "./http.js";

const labels = new Set([
  "company",
  "project",
  "doc_no",
  "price",
  "person",
  "contact",
  "biz_no",
]);
const states = new Set([
  "preparing",
  "queued",
  "analyzing",
  "awaiting_approval",
  "processing",
  "completed",
  "blocked",
  "rejected",
  "expired",
  "failed",
]);
const date = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
function invalid() {
  throw new ApiError(
    "INVALID_RESPONSE",
    "처리 응답을 확인하지 못했습니다. 현재 상태를 다시 조회해 주세요.",
  );
}

/** Validate the exact inspection string; convert code points only for display. */
export function approvalPreview(data, requestId) {
  const p = data?.preview;
  if (
    !p ||
    p.request_id !== requestId ||
    p.state !== "awaiting_approval" ||
    p.inspection_status !== "complete" ||
    p.processing_route !== "external" ||
    typeof p.input_text !== "string" ||
    !p.input_text.trim() ||
    p.approval?.status !== "pending" ||
    !date(p.approval.expires_at) ||
    !Array.isArray(p.detection_spans) ||
    p.detection_count !== p.detection_spans.length
  )
    invalid();
  const points = Array.from(p.input_text);
  const offsets = [0];
  for (const point of points) offsets.push(offsets.at(-1) + point.length);
  let end = 0;
  const ids = new Set();
  const spans = p.detection_spans.map((s) => {
    if (
      !s ||
      typeof s.id !== "string" ||
      !s.id ||
      ids.has(s.id) ||
      !["instruction", "pdf"].includes(s.input_source) ||
      !labels.has(s.label) ||
      !Number.isInteger(s.start_offset) ||
      !Number.isInteger(s.end_offset) ||
      s.start_offset < end ||
      s.end_offset <= s.start_offset ||
      s.end_offset > points.length
    )
      invalid();
    end = s.end_offset;
    ids.add(s.id);
    return {
      id: s.id,
      input_source: s.input_source,
      label: s.label,
      start_offset: s.start_offset,
      end_offset: s.end_offset,
      start: offsets[s.start_offset],
      end: offsets[s.end_offset],
      text: points.slice(s.start_offset, s.end_offset).join(""),
    };
  });
  // No invented placeholder/masked flag: these are detection spans only.
  return {
    request_id: requestId,
    input_text: p.input_text,
    spans,
    detection_count: spans.length,
    expires_at: p.approval.expires_at,
  };
}

export function approvalDecision(data, requestId, decision) {
  const r = data?.request;
  if (
    !r ||
    r.request_id !== requestId ||
    !states.has(r.state) ||
    r.approval?.status !== decision ||
    !date(r.approval.decided_at) ||
    !(r.approval.expires_at === null || date(r.approval.expires_at)) ||
    typeof r.replayed !== "boolean" ||
    (decision === "rejected" && r.state !== "rejected") ||
    (decision === "approved" &&
      !["queued", "processing", "completed", "failed"].includes(r.state))
  )
    invalid();
  return {
    id: requestId,
    request_id: requestId,
    state: r.state,
    approval: {
      status: r.approval.status,
      decided_at: r.approval.decided_at,
      expires_at: r.approval.expires_at,
    },
    replayed: r.replayed,
  };
}

/** The next screen should reconcile via GET, never replay a mutation itself. */
export function processingRecovery(error) {
  if (["AUTH_REQUIRED", "SESSION_CHANGED"].includes(error.code))
    return "session";
  if (["FORBIDDEN", "REQUEST_NOT_FOUND"].includes(error.code))
    return "unavailable";
  if (
    [
      "NETWORK_ERROR",
      "SERVICE_UNAVAILABLE",
      "INVALID_RESPONSE",
      "PROCESSING_ALREADY_STARTED",
      "APPROVAL_ALREADY_DECIDED",
      "APPROVAL_NOT_AVAILABLE",
      "APPROVAL_EXPIRED",
      // Extraction errors can persist failed state despite an HTTP 400.
      "PDF_NO_TEXT",
      "INVALID_PDF",
      "PDF_ENCRYPTED",
      "PDF_PAGE_LIMIT",
      "PDF_TOO_LARGE",
      "PDF_SUPPORT_MISSING",
    ].includes(error.code) ||
    error.status >= 500
  )
    return "refresh";
  return "input";
}
