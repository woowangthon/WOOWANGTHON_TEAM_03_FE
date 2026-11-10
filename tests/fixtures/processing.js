// Synthetic HTTP contracts for BE PR #11 (290deff); no model or server calls.
export const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const inputText = "😀 요약해 주세요.\n\n가상회사 보고서";
export function previewFixture({
  clean = false,
  expiresAt = "2026-11-11T00:30:00Z",
} = {}) {
  const start = Array.from(inputText.split("가상회사")[0]).length;
  return {
    preview: {
      request_id: requestId,
      state: "awaiting_approval",
      inspection_status: "complete",
      processing_route: "external",
      input_text: inputText,
      detection_count: clean ? 0 : 1,
      detection_spans: clean
        ? []
        : [
            {
              id: "span-1",
              input_source: "pdf",
              start_offset: start,
              end_offset: start + 4,
              label: "company",
            },
          ],
      approval: { status: "pending", expires_at: expiresAt },
    },
  };
}
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const error = (code, status = 409) =>
  json({ error: { code, message: `가상 오류: ${code}` } }, status);

/** Explicit advance replaces model timing; GET never secretly completes work. */
export function createProcessingFixture({
  now = () => Date.parse("2026-11-11T00:00:00Z"),
  clean = false,
} = {}) {
  const calls = [];
  let state = "preparing",
    decision = null,
    decidedAt = null,
    expiresAt = null,
    hidden = false;
  let nextFailure = null;
  const detail = () => ({
    request: {
      request_id: requestId,
      client_request_key: requestId,
      instruction: "😀 요약해 주세요.",
      state,
      processing_available: state === "preparing",
      document: null,
      answer_text: state === "completed" ? "가상 복원 답변입니다." : null,
      finished_at: [
        "completed",
        "failed",
        "blocked",
        "rejected",
        "expired",
      ].includes(state)
        ? new Date(now()).toISOString()
        : null,
    },
  });
  return {
    calls,
    advance(next) {
      state = next;
      if (next === "awaiting_approval")
        expiresAt = new Date(now() + 30 * 60 * 1000).toISOString();
    },
    failNext(code, status = 409) {
      nextFailure = { code, status };
    },
    async fetchImpl(url, options = {}) {
      calls.push({ url, ...options });
      if (url.endsWith("/auth/csrf/"))
        return json({ csrf_token: "synthetic-csrf" });
      if (nextFailure) {
        const f = nextFailure;
        nextFailure = null;
        return error(f.code, f.status);
      }
      if (!url.includes(`/${requestId}/`))
        return error("REQUEST_NOT_FOUND", 404);
      if (hidden && !url.endsWith("/hide/"))
        return error("REQUEST_NOT_FOUND", 404);
      if (url.endsWith("/start/")) {
        if (state !== "preparing") return error("PROCESSING_ALREADY_STARTED");
        state = "queued";
        return json(detail(), 202);
      }
      if (url.endsWith("/approval-preview/")) {
        if (state !== "awaiting_approval")
          return error("APPROVAL_NOT_AVAILABLE");
        if (now() >= Date.parse(expiresAt)) return error("APPROVAL_EXPIRED");
        return json(previewFixture({ clean, expiresAt }));
      }
      if (url.endsWith("/approval/")) {
        const value = JSON.parse(options.body).decision;
        if (!["approved", "rejected"].includes(value))
          return error("INVALID_INPUT", 400);
        if (decision && decision !== value)
          return error("APPROVAL_ALREADY_DECIDED");
        const replayed = decision !== null;
        if (!replayed) {
          if (state !== "awaiting_approval")
            return error("APPROVAL_NOT_AVAILABLE");
          if (now() >= Date.parse(expiresAt)) {
            state = "expired";
            return error("APPROVAL_EXPIRED");
          }
          decision = value;
          decidedAt = new Date(now()).toISOString();
          state = value === "approved" ? "queued" : "rejected";
        }
        return json({
          request: {
            request_id: requestId,
            state,
            replayed,
            approval: {
              status: decision,
              decided_at: decidedAt,
              expires_at: expiresAt,
            },
          },
        });
      }
      if (url.endsWith("/hide/")) {
        hidden = true;
        return new Response(null, { status: 204 });
      }
      return json(detail());
    },
  };
}
