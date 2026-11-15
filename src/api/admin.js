import { ApiError, createHttpClient } from "./http.js";

export const adminMetrics = [
  ["total_requests", "접수된 요청"],
  ["detection_count", "민감정보가 발견된 곳"],
  ["warning_requests", "경고 요청"],
  ["inspection_anomalies", "검사가 불완전하거나 실패한 요청"],
  ["policy_blocked_requests", "보안 정책으로 차단된 요청"],
  ["external_sent_confirmed_requests", "외부 AI 전송이 확인된 요청"],
];
export { detectionLabels } from "../domain/requests.js";
export const routeLabels = { local: "사내", external: "외부", blocked: "차단" };
export const inspectionLabels = {
  pending: "검사 대기",
  complete: "검사 완료",
  degraded: "불완전 검사",
  failed: "검사 실패",
};
const warningDescriptions = new Map(
  Object.entries({
    INJECTION_DETECTED:
      "문서 안에서 AI 지시문으로 의심되는 내용을 발견했습니다.",
    LLM_FAILED: "정밀 검사 모델 호출에 실패했습니다.",
    LLM_OUTPUT_TRUNCATED: "정밀 검사 출력이 상한에서 잘렸습니다.",
    ROUTE_FAILED: "처리 경로 판정 모델 호출에 실패했습니다.",
    ROUTE_INPUT_TRUNCATED: "긴 문서의 앞부분만으로 처리 경로를 판정했습니다.",
    LLM_SPANS_DROPPED:
      "모델이 원문에 없는 값을 반환해 해당 구간을 제외했습니다.",
    SPAN_LABEL_UNSUPPORTED: "지원하지 않는 분류의 탐지 구간을 제외했습니다.",
    SPAN_SAVE_SKIPPED: "탐지 구간 일부를 저장하지 못했습니다.",
    WARNING_OTHER: "기타 검사 경고가 기록되었습니다.",
  }),
);
const failureDescriptions = new Map(
  Object.entries({
    PDF_NO_TEXT: "PDF에서 검사할 텍스트를 읽지 못했습니다.",
    INVALID_PDF: "PDF 파일을 읽을 수 없습니다.",
    PDF_ENCRYPTED: "암호화된 PDF를 읽을 수 없습니다.",
    PDF_PAGE_LIMIT: "PDF 쪽 수가 허용 범위를 초과했습니다.",
    MODEL_UNAVAILABLE:
      "모델 서비스 연결 실패 또는 응답 지연으로 처리를 완료하지 못했습니다.",
    MODEL_AUTH: "모델 서비스 인증에 실패했습니다.",
    MODEL_INPUT: "모델 서비스가 검사 입력을 거부했습니다.",
    MODEL_SERVER_ERROR: "모델 서비스에서 오류가 발생했습니다.",
    INSPECTION_DEGRADED: "검사가 불완전해 처리를 중단했습니다.",
    SPAN_SAVE_SKIPPED: "탐지 구간을 온전히 저장하지 못해 처리를 중단했습니다.",
    MASK_MISMATCH:
      "저장된 정보로 만든 가림 결과가 검사 결과와 달라 처리를 중단했습니다.",
    DECISION_UNKNOWN: "처리 경로 판정 결과를 확인하지 못했습니다.",
    LEAK_BLOCKED: "전송 직전 검사에서 민감정보가 남아 전송을 중단했습니다.",
    EXTERNAL_REFUSAL: "외부 AI가 요청을 거부했습니다.",
    EXTERNAL_RATE_LIMITED: "외부 AI의 요청 한도로 처리를 완료하지 못했습니다.",
    ANSWER_TRUNCATED: "답변이 생성 상한에서 잘렸습니다.",
    ANSWER_EMPTY: "사용할 수 있는 답변이 생성되지 않았습니다.",
    RESTORE_INCOMPLETE: "가린 정보의 복원이 완료되지 않았습니다.",
    APPROVAL_NOT_AVAILABLE: "외부 전송 승인 대기로 전환하지 못했습니다.",
    PREVIEW_NOT_AVAILABLE: "승인 전 확인 정보를 준비하지 못했습니다.",
    INTERNAL_ERROR: "처리 중 내부 오류가 발생했습니다.",
    STUCK: "진행 상태가 장시간 유지되어 처리를 종료했습니다.",
  }),
);
const failureStages = new Map(
  Object.entries({
    extraction: "PDF 추출",
    inspection: "민감정보 검사",
    decision: "경로 판정",
    local_answer: "사내 답변 생성",
    external_send: "외부 요청 처리",
    restore: "답변 복원",
    approval: "승인 준비",
    system: "시스템 처리",
  }),
);
export function warningLabel(code) {
  return `${warningDescriptions.get(code) || "등록되지 않은 경고 코드입니다."} (${code})`;
}
export function failureLabel(code) {
  if (!code) return "미기록";
  return `${failureDescriptions.get(code) || "등록되지 않은 실패 코드입니다."} (${code})`;
}
export function failureStageLabel(stage) {
  return failureStages.get(stage) || stage || "미기록";
}
const filterKeys = [
  "q",
  "request_id",
  "user_id",
  "date_from",
  "date_to",
  "state",
  "processing_route",
  "detection_label",
  "has_warnings",
  "inspection_status",
  "inspection_anomaly",
];
const pick = (value, keys) =>
  Object.fromEntries(keys.map((key) => [key, value?.[key]]));
function invalid() {
  throw new ApiError(
    "INVALID_RESPONSE",
    "관리자 조회 응답을 확인하지 못했습니다. 다시 조회해 주세요.",
  );
}
function adminOnly(user) {
  if (user?.role !== "admin")
    throw new ApiError("FORBIDDEN", "관리자 권한이 필요합니다.", 403);
}
export function adminQuery(filters, pagination) {
  const query = new URLSearchParams();
  for (const key of filterKeys) {
    const value = String(filters[key] ?? "").trim();
    if (value) query.set(key, value);
  }
  if (pagination) {
    query.set("page", pagination.page ?? 1);
    query.set("page_size", pagination.page_size ?? 20);
  }
  return query.toString();
}
export function recentPeriod(days = 7, now = new Date()) {
  const date_to = new Date(now.getTime() + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
  const date_from = new Date(Date.parse(date_to) - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  return { date_from, date_to };
}
export function validatePeriod({ date_from, date_to }) {
  const validDate = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(date_from) || !validDate(date_to))
    return "시작일과 종료일을 선택해 주세요.";
  const days = (Date.parse(date_to) - Date.parse(date_from)) / 86400000 + 1;
  if (days < 1 || days > 366)
    return "시작일부터 종료일까지 1~366일로 선택해 주세요.";
  return "";
}
function metrics(data) {
  return Object.fromEntries(
    adminMetrics.map(([key]) => {
      const metric = data?.[key];
      if (
        !metric ||
        !["complete", "partial", "unavailable"].includes(metric.status) ||
        !Number.isInteger(metric.known_value) ||
        metric.known_value < 0 ||
        !Number.isInteger(metric.unknown_request_count) ||
        metric.unknown_request_count < 0 ||
        (metric.status === "complete"
          ? !Number.isInteger(metric.value) ||
            metric.value < 0 ||
            metric.unknown_request_count !== 0
          : metric.value !== null)
      )
        invalid();
      return [
        key,
        pick(metric, [
          "value",
          "known_value",
          "unknown_request_count",
          "status",
        ]),
      ];
    }),
  );
}
function coverage(value) {
  return pick(value, [
    "inspection_complete_requests",
    "inspection_pending_requests",
    "inspection_degraded_requests",
    "inspection_failed_requests",
    "external_delivery_unknown_requests",
  ]);
}
function row(value) {
  if (
    typeof value?.request_id !== "string" ||
    !value.user ||
    typeof value.state !== "string"
  )
    invalid();
  return {
    ...pick(value, [
      "request_id",
      "created_at",
      "finished_at",
      "input_type",
      "original_filename",
      "state",
      "processing_route",
      "inspection_status",
      "detection_count",
      "detection_labels",
      "error_code",
    ]),
    user: pick(value.user, ["id", "username", "full_name", "is_active"]),
    warning_codes: Array.isArray(value.warning_codes)
      ? value.warning_codes
      : [],
  };
}
// Whitelist audit fields: an unexpected answer field must never reach the admin UI.
export function auditDetail(value) {
  const base = row(value);
  if (
    typeof value.instruction !== "string" ||
    !Array.isArray(value.detection_spans) ||
    !Array.isArray(value.masking_mappings)
  )
    invalid();
  return {
    ...base,
    ...pick(value, [
      "instruction",
      "input_text",
      "updated_at",
      "hidden_at",
      "detection_is_final",
    ]),
    document: value.document
      ? pick(value.document, [
          "original_filename",
          "size_bytes",
          "page_count",
          "extraction_status",
          "extracted_text",
        ])
      : null,
    detection_spans: value.detection_spans.map((span) =>
      pick(span, [
        "id",
        "value",
        "label",
        "input_source",
        "start_offset",
        "end_offset",
        "mapping_id",
      ]),
    ),
    masking_mappings: value.masking_mappings.map((mapping) =>
      pick(mapping, ["id", "value", "label", "placeholder"]),
    ),
    approval: pick(value.approval, ["status", "expires_at", "decided_at"]),
    delivery: pick(value.delivery, ["status", "external_send_started_at"]),
    failure: pick(value.failure, ["stage", "code"]),
  };
}
export function createAdminApi(client = createHttpClient()) {
  return {
    async list(user, filters, { page = 1, page_size = 20, signal } = {}) {
      adminOnly(user);
      const data = await client.request(
        "/admin/requests/?" + adminQuery(filters, { page, page_size }),
        { signal },
      );
      if (
        !Array.isArray(data?.results) ||
        !Number.isInteger(data.count) ||
        !Number.isInteger(data.page)
      )
        invalid();
      return {
        ...pick(data, [
          "count",
          "page",
          "page_size",
          "total_pages",
          "next_page",
          "previous_page",
        ]),
        results: data.results.map(row),
      };
    },
    async statistics(user, filters, { signal } = {}) {
      adminOnly(user);
      const error = validatePeriod(filters);
      if (error) throw new ApiError("INVALID_INPUT", error, 400);
      const data = await client.request(
        "/admin/statistics/?" + adminQuery(filters),
        { signal },
      );
      if (
        !Array.isArray(data?.daily) ||
        data.timezone !== "Asia/Seoul" ||
        data.date_basis !== "created_at"
      )
        invalid();
      return {
        timezone: data.timezone,
        date_basis: data.date_basis,
        calculated_at: data.calculated_at,
        summary: {
          metrics: metrics(data.summary?.metrics),
          coverage: coverage(data.summary?.coverage),
        },
        daily: data.daily.map((day) => ({
          date: day.date,
          metrics: metrics(day.metrics),
          coverage: coverage(day.coverage),
        })),
      };
    },
    async detail(user, id, { signal } = {}) {
      adminOnly(user);
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        throw new ApiError(
          "REQUEST_NOT_FOUND",
          "요청을 찾을 수 없습니다.",
          404,
        );
      const data = await client.request(`/admin/requests/${id}/`, { signal });
      return auditDetail(data?.request);
    },
  };
}
