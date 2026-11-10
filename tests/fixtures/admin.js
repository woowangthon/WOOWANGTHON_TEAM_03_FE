// Synthetic data only. Kept independent of application adapters to check the contract.
export const auditId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const auditUser = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "USER0001",
  full_name: "감사 시험 직원",
  is_active: false,
};
export function complete(value = 0) {
  return {
    value,
    known_value: value,
    unknown_request_count: 0,
    status: "complete",
  };
}
export function statistics(filters = {}) {
  const metrics = {
    total_requests: complete(3),
    detection_count: {
      value: null,
      known_value: 2,
      unknown_request_count: 1,
      status: "partial",
    },
    warning_requests: {
      value: null,
      known_value: 0,
      unknown_request_count: 3,
      status: "unavailable",
    },
    inspection_anomalies: {
      value: null,
      known_value: 0,
      unknown_request_count: 1,
      status: "partial",
    },
    policy_blocked_requests: complete(0),
    external_sent_confirmed_requests: complete(1),
  };
  const coverage = {
    inspection_complete_requests: 2,
    inspection_pending_requests: 1,
    inspection_degraded_requests: 0,
    inspection_failed_requests: 0,
    external_delivery_unknown_requests: 1,
  };
  return {
    timezone: "Asia/Seoul",
    date_basis: "created_at",
    calculated_at: "2026-11-10T03:00:00Z",
    filters,
    summary: { metrics, coverage },
    daily: [{ date: "2026-11-10", metrics, coverage }],
  };
}
export function auditRow(overrides = {}) {
  return {
    request_id: auditId,
    user: auditUser,
    created_at: "2026-11-10T02:00:00Z",
    finished_at: null,
    input_type: "pdf",
    original_filename: "가상-감사.pdf",
    state: "preparing",
    processing_route: null,
    inspection_status: "pending",
    detection_count: null,
    detection_labels: null,
    warning_codes: [],
    error_code: null,
    ...overrides,
  };
}
export function auditDetailFixture() {
  return {
    ...auditRow(),
    instruction: "가상 의뢰문입니다.",
    input_text: "가상 회사의 문서",
    updated_at: "2026-11-10T02:00:00Z",
    hidden_at: null,
    document: {
      original_filename: "가상-감사.pdf",
      size_bytes: 120,
      page_count: 1,
      extraction_status: "ready",
      extracted_text: "가상 추출문",
      file_url: "/never-trust-metadata-url/",
      answer_text: "NESTED_SECRET_ANSWER",
    },
    detection_is_final: false,
    detection_spans: [
      {
        id: "span1",
        value: "가상 회사",
        label: "company",
        input_source: "pdf",
        start_offset: 0,
        end_offset: 5,
        mapping_id: "map1",
      },
    ],
    masking_mappings: [
      {
        id: "map1",
        value: "가상 회사",
        label: "company",
        placeholder: "[[ORG_1]]",
      },
    ],
    approval: { status: null, expires_at: null, decided_at: null },
    delivery: {
      status: "unknown",
      external_send_started_at: "2026-11-10T02:10:00Z",
    },
    failure: { stage: null, code: null },
    answer_text: "SECRET_AI_ANSWER_NEVER_RENDER",
  };
}
