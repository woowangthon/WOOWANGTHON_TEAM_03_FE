import test from "node:test";
import assert from "node:assert/strict";
import {
  createAdminApi,
  adminQuery,
  auditDetail,
  recentPeriod,
  validatePeriod,
} from "../src/api/admin.js";
import {
  auditDetailFixture,
  auditId,
  auditRow,
  statistics,
} from "./fixtures/admin.js";
const admin = { role: "admin" };
test("KST periods cross UTC midnight and limit inclusive ranges", () => {
  assert.deepEqual(recentPeriod(7, new Date("2026-11-09T15:00:00Z")), {
    date_from: "2026-11-04",
    date_to: "2026-11-10",
  });
  assert.equal(
    validatePeriod({ date_from: "2024-01-01", date_to: "2024-12-31" }),
    "",
  );
  assert.ok(validatePeriod({ date_from: "2024-01-01", date_to: "2025-01-01" }));
  assert.ok(validatePeriod({ date_from: "2026-02-30", date_to: "2026-03-01" }));
  assert.ok(validatePeriod({ date_from: "2026-11-10", date_to: "2026-11-09" }));
});
test("queries use shared supported filters, omit blanks and paginate only lists", () => {
  const filters = {
    q: " 직원 ",
    date_from: "2026-11-04",
    date_to: "2026-11-10",
    state: "",
    processing_route: "external",
    has_warnings: "false",
    inspection_status: "complete",
    inspection_anomaly: false,
    has_warning: true,
    page: 2,
  };
  const query = new URLSearchParams(adminQuery(filters));
  assert.deepEqual(
    [...query.keys()],
    [
      "q",
      "date_from",
      "date_to",
      "processing_route",
      "has_warnings",
      "inspection_status",
      "inspection_anomaly",
    ],
  );
  assert.equal(query.get("q"), "직원");
  assert.equal(query.get("has_warnings"), "false");
  assert.equal(query.get("inspection_anomaly"), "false");
  assert.equal(
    new URLSearchParams(adminQuery(filters, { page: 2 })).get("page"),
    "2",
  );
});
test("admin adapters preserve unknown metrics and strip AI answers at every displayed level", async () => {
  const calls = [];
  const api = createAdminApi({
    async request(path) {
      calls.push(path);
      if (path.startsWith("/admin/statistics/")) return statistics();
      if (path === `/admin/requests/${auditId}/`)
        return { request: auditDetailFixture() };
      return {
        count: 1,
        page: 1,
        results: [
          {
            ...auditRow(),
            instruction: "LIST_SECRET",
            answer_text: "LIST_ANSWER",
          },
        ],
      };
    },
  });
  const result = await api.statistics(admin, recentPeriod());
  assert.equal(result.summary.metrics.detection_count.value, null);
  assert.equal(result.summary.metrics.policy_blocked_requests.value, 0);
  assert.equal(result.daily[0].metrics.warning_requests.status, "unavailable");
  const detail = await api.detail(admin, auditId);
  assert.equal(detail.instruction, "가상 의뢰문입니다.");
  assert.equal(detail.document.file_url, undefined);
  assert.ok(!JSON.stringify(detail).includes("ANSWER"));
  const list = await api.list(admin, recentPeriod());
  assert.ok(!JSON.stringify(list).includes("LIST_"));
  assert.equal(calls[1], `/admin/requests/${auditId}/`);
  assert.ok(!calls[0].includes("page="));
  assert.deepEqual(auditDetail(auditDetailFixture()), detail);
});
test("non-admin roles cannot issue any admin query and malformed metrics are not zeroed", async () => {
  let called = false;
  const api = createAdminApi({
    request: async () => {
      called = true;
      return {};
    },
  });
  for (const role of ["user", "staff", undefined]) {
    await assert.rejects(api.statistics({ role }, recentPeriod()), {
      code: "FORBIDDEN",
    });
    await assert.rejects(api.list({ role }, {}), { code: "FORBIDDEN" });
    await assert.rejects(api.detail({ role }, auditId), { code: "FORBIDDEN" });
  }
  assert.equal(called, false);
  const malformed = statistics();
  malformed.summary.metrics.detection_count.value = 0;
  await assert.rejects(
    createAdminApi({ request: async () => malformed }).statistics(
      admin,
      recentPeriod(),
    ),
    { code: "INVALID_RESPONSE" },
  );
});
