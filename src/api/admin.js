import { ApiError, createHttpClient } from "./http.js";

export const adminMetrics = [
  ["total_requests", "전체 요청"],
  ["detection_count", "탐지 구간"],
  ["warning_requests", "경고 요청"],
  ["inspection_anomalies", "검사 이상"],
  ["policy_blocked_requests", "정책 차단"],
  ["external_sent_confirmed_requests", "외부 전송 확인"],
];
export { detectionLabels } from "../domain/requests.js";
export const routeLabels = { local: "사내", external: "외부", blocked: "차단" };
export const inspectionLabels = {
  pending: "검사 대기",
  complete: "검사 완료",
  degraded: "축소 검사",
  failed: "검사 실패",
};
const filterKeys = [
  "q",
  "request_id",
  "user_id",
  "date_from",
  "date_to",
  "state",
  "processing_route",
  "detection_label",
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
