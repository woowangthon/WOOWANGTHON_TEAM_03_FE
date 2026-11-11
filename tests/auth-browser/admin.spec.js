import { test, expect } from "@playwright/test";
import { admin, employee, installAuthFixture } from "./auth-fixture.js";
import {
  auditId,
  auditRow,
  auditDetailFixture,
  complete,
  statistics,
} from "../fixtures/admin.js";

async function installAudit(page) {
  const auth = await installAuthFixture(page, { signedIn: admin });
  const state = { calls: [], failure: null, delay: null, totals: null };
  await page.route("**/api/v1/admin/**", async (route) => {
    const url = new URL(route.request().url());
    if (!/\/admin\/(statistics|requests)\//.test(url.pathname))
      return route.fallback();
    state.calls.push({
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
    });
    expect(route.request().method()).toBe("GET");
    if (state.delay) {
      const wait = state.delay;
      state.delay = null;
      await wait;
    }
    if (state.failure)
      return route.fulfill({
        status: state.failure.status,
        json: {
          error: { code: state.failure.code, message: state.failure.code },
        },
      });
    if (url.pathname.endsWith("statistics/")) {
      expect(url.searchParams.has("page")).toBe(false);
      const response = statistics(Object.fromEntries(url.searchParams));
      if (state.totals) {
        response.summary.metrics.total_requests = complete(
          state.totals.statistics,
        );
        response.summary.metrics.warning_requests = complete(0);
      }
      return route.fulfill({
        json: response,
      });
    }
    if (url.pathname === `/api/v1/admin/requests/${auditId}/`) {
      expect(url.search).toBe("");
      return route.fulfill({
        json: { request: state.detail || auditDetailFixture() },
      });
    }
    const p = Number(url.searchParams.get("page"));
    return route.fulfill({
      json: {
        count: state.totals?.list ?? 21,
        page: p,
        page_size: 20,
        total_pages: state.totals ? 1 : 2,
        next_page: p === 1 && !state.totals ? 2 : null,
        previous_page: p === 2 ? 1 : null,
        results: [
          auditRow({
            ...state.row,
            original_filename: p === 1 ? "가상-감사.pdf" : "둘째-페이지.pdf",
            ...(state.totals
              ? { inspection_status: "complete", detection_count: 0 }
              : {}),
          }),
        ],
      },
    });
  });
  return { auth, state };
}

test("audit explains new failures and warnings while keeping delivery confirmation separate", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { state } = await installAudit(page);
  state.row = {
    state: "failed",
    inspection_status: "degraded",
    warning_codes: ["INJECTION_DETECTED", "FUTURE_WARNING"],
    error_code: "SPAN_SAVE_SKIPPED",
  };
  state.detail = {
    ...auditDetailFixture(),
    ...state.row,
    failure: { stage: "inspection", code: "MASK_MISMATCH" },
    delivery: {
      status: "confirmed_sent",
      external_send_started_at: "2026-11-10T02:10:00Z",
    },
  };
  await page.goto("/admin");
  await expect(
    page.getByRole("option", { name: "불완전 검사", exact: true }),
  ).toHaveCount(1);
  const row = page.getByRole("row").filter({ hasText: auditId });
  await expect(row).toContainText("불완전 검사");
  await expect(row).toContainText("AI 지시문으로 의심");
  await expect(row).toContainText(
    "등록되지 않은 경고 코드입니다. (FUTURE_WARNING)",
  );
  await expect(row).toContainText(
    "탐지 구간을 온전히 저장하지 못해 처리를 중단했습니다. (SPAN_SAVE_SKIPPED)",
  );
  expect((await row.boundingBox()).height).toBeLessThan(300);
  await page.getByRole("button", { name: `${auditId} 상세 보기` }).click();
  const detail = page.getByRole("region", { name: "요청 감사 상세" });
  await expect(detail).toContainText("민감정보 검사");
  await expect(detail).toContainText("가림 결과가 검사 결과와 달라");
  await expect(detail).toContainText("MASK_MISMATCH");
  await expect(detail).toContainText("외부 전송 확인");
  await expect(page.locator("body")).not.toContainText("SECRET");
});
test("audit displays uncertain metrics, actual zeros, safe detail and supported filters", async ({
  page,
}) => {
  const { auth, state } = await installAudit(page);
  await page.goto("/admin");
  await expect(page.getByTestId("metric-detection_count")).toContainText(
    "부분 집계",
  );
  await expect(page.getByTestId("metric-detection_count")).toContainText(
    "확인된 값 2건 · 미확정 요청 1건",
  );
  await expect(page.getByTestId("metric-warning_requests")).toContainText(
    "집계 불가",
  );
  await expect(
    page.getByTestId("metric-policy_blocked_requests"),
  ).toContainText("0건");
  await page.getByLabel("차트 지표").selectOption("warning_requests");
  await expect(
    page.getByRole("img", { name: "경고 요청 일별 추이" }),
  ).toContainText("미확정");
  await page.getByRole("button", { name: `${auditId} 상세 보기` }).click();
  const detail = page.getByRole("region", { name: "요청 감사 상세" });
  await expect(detail).toContainText("비활성 계정");
  await detail.getByText("요청문·검사 원문 보기", { exact: true }).click();
  await expect(detail).toContainText("가상 의뢰문입니다.");
  await detail.getByText("탐지 구간·가림 대응표 보기", { exact: true }).click();
  await expect(detail).toContainText("[[ORG_1]]");
  await expect(page.locator("body")).not.toContainText("SECRET");
  await page.getByLabel("이용자·파일명 검색").fill("USER0001");
  await page.getByLabel("요청 상태", { exact: true }).selectOption("blocked");
  await page.getByLabel("처리 경로", { exact: true }).selectOption("external");
  await page.getByLabel("탐지 분류").selectOption("company");
  await page.getByLabel("경고 여부", { exact: true }).selectOption("true");
  await page.getByLabel("검사 상태", { exact: true }).selectOption("degraded");
  await page.getByLabel("검사 이상", { exact: true }).selectOption("true");
  await page.getByRole("button", { name: "조건 적용", exact: true }).click();
  await expect(detail).toHaveCount(0);
  await expect
    .poll(
      () => state.calls.filter((call) => call.query.state === "blocked").length,
    )
    .toBe(2);
  for (const call of state.calls.slice(-2))
    expect(call.query).toMatchObject({
      q: "USER0001",
      state: "blocked",
      processing_route: "external",
      detection_label: "company",
      has_warnings: "true",
      inspection_status: "degraded",
      inspection_anomaly: "true",
    });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByText("둘째-페이지.pdf", { exact: true }),
  ).toBeVisible();
  expect(auth.calls).not.toContain("GET /requests/");
  expect(auth.unexpected).toEqual([]);
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
});
test("applied inspection filters reset pagination and distinguish no warning from unknown", async ({
  page,
}) => {
  const { state } = await installAudit(page);
  await page.goto("/admin");
  const list = page.getByRole("region", { name: "관리자 요청 목록" });
  await expect(list.getByText("경고 미확정", { exact: true })).toBeVisible();
  await list.getByRole("button", { name: "다음", exact: true }).click();
  await expect(list.getByText("2 / 2페이지")).toBeVisible();

  state.totals = { list: 1, statistics: 1 };
  await page.getByLabel("경고 여부", { exact: true }).selectOption("false");
  await page.getByLabel("검사 상태", { exact: true }).selectOption("complete");
  await page.getByLabel("검사 이상", { exact: true }).selectOption("false");
  await page.getByRole("button", { name: "조건 적용", exact: true }).click();
  await expect(list.getByText("1 / 1페이지")).toBeVisible();
  await expect(list.getByText("경고 없음", { exact: true })).toBeVisible();
  await expect(page.getByTestId("metric-warning_requests")).toContainText(
    "0건",
  );
  await expect(page.getByText(/요청 수가 다릅니다/)).toHaveCount(0);
  const [listCall, statsCall] = [
    state.calls.slice(-2).find((call) => call.path.endsWith("/requests/")),
    state.calls.slice(-2).find((call) => call.path.endsWith("/statistics/")),
  ];
  const { page: requestPage, page_size, ...filters } = listCall.query;
  expect(requestPage).toBe("1");
  expect(page_size).toBe("20");
  expect(filters).toEqual(statsCall.query);
  expect(filters).toMatchObject({
    has_warnings: "false",
    inspection_status: "complete",
    inspection_anomaly: "false",
  });

  state.totals.statistics = 2;
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(
    page.getByText(/목록 1건과 통계 2건의 요청 수가 다릅니다/),
  ).toBeVisible();
  state.totals.statistics = 1;
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(page.getByTestId("metric-total_requests")).toContainText("1건");
  await expect(page.getByText(/요청 수가 다릅니다/)).toHaveCount(0);
});
test("refresh waits for completion, ignores old filters and stops on leaving overview", async ({
  page,
}) => {
  await page.clock.install();
  const { state } = await installAudit(page);
  await page.goto("/admin");
  await expect(page.getByTestId("metric-total_requests")).toBeVisible();
  const original = state.calls.length;
  let release;
  state.delay = new Promise((resolve) => {
    release = resolve;
  });
  await page.clock.runFor(30001);
  await expect.poll(() => state.calls.length).toBe(original + 2);
  await page.clock.runFor(60000);
  expect(state.calls.length).toBe(original + 2);
  await page.getByLabel("이용자·파일명 검색").fill("최신조건");
  await page.getByRole("button", { name: "조건 적용", exact: true }).click();
  await expect
    .poll(() => state.calls.some((call) => call.query.q === "최신조건"))
    .toBe(true);
  release();
  await expect(page.getByTestId("metric-total_requests")).toBeVisible();
  await page.getByRole("button", { name: "사용자 관리", exact: true }).click();
  const afterLeave = state.calls.length;
  await page.clock.runFor(60000);
  expect(state.calls.length).toBe(afterLeave);
  await expect(page.getByTestId("metric-total_requests")).toHaveCount(0);
});
test("failed refresh is an error, and revoked permission clears all audit data", async ({
  page,
}) => {
  const { state } = await installAudit(page);
  await page.goto("/admin");
  await expect(page.getByTestId("metric-total_requests")).toBeVisible();
  await page.getByRole("button", { name: `${auditId} 상세 보기` }).click();
  await expect(
    page.getByRole("region", { name: "요청 감사 상세" }),
  ).toContainText("비활성 계정");
  state.failure = { status: 503, code: "ADMIN_STATISTICS_FAILED" };
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(page.getByText(/통계 조회 실패:/)).toBeVisible();
  await expect(page.getByTestId("metric-total_requests")).toHaveCount(0);
  await expect(page.getByText("해당하는 요청이 없습니다")).toHaveCount(0);
  state.failure = { status: 403, code: "FORBIDDEN" };
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(page.getByText(/이전 조회 자료를 닫았습니다/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "요청 감사 상세" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "로그아웃", exact: true }),
  ).toBeVisible();
});
test("403 AUTH_REQUIRED removes protected UI; ordinary users never query admin APIs", async ({
  page,
}) => {
  const { state } = await installAudit(page);
  await page.goto("/admin");
  await expect(page.getByTestId("metric-total_requests")).toBeVisible();
  state.failure = { status: 403, code: "AUTH_REQUIRED" };
  await page.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "보안 현황" })).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  const userAuth = await installAuthFixture(page, { signedIn: employee });
  await page.goto("/admin");
  await expect(page.getByRole("alert")).toContainText("관리자만 접근");
  expect(userAuth.calls.some((call) => call.includes("/admin/"))).toBe(false);
});
test("permission denial closes an open audit immediately while another read stalls", async ({
  page,
}) => {
  await page.clock.install();
  const { state } = await installAudit(page);
  await page.goto("/admin");
  await expect(page.getByTestId("metric-total_requests")).toBeVisible();
  await page.getByRole("button", { name: `${auditId} 상세 보기` }).click();
  await expect(
    page.getByRole("region", { name: "요청 감사 상세" }),
  ).toContainText("비활성 계정");
  let release;
  state.delay = new Promise((resolve) => {
    release = resolve;
  });
  state.failure = { status: 403, code: "FORBIDDEN" };
  await page.clock.runFor(30001);
  await expect(page.getByText(/이전 조회 자료를 닫았습니다/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "요청 감사 상세" }),
  ).toHaveCount(0);
  await expect(page.getByTestId("metric-total_requests")).toHaveCount(0);
  release();
});
test("date validation and mobile audit layout stay usable", async ({
  page,
}) => {
  const { state } = await installAudit(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  await expect(page.getByTestId("metric-total_requests")).toBeVisible();
  const calls = state.calls.length;
  await page.getByLabel("시작일", { exact: true }).fill("2025-01-01");
  await page.getByLabel("종료일", { exact: true }).fill("2026-11-10");
  await page.getByRole("button", { name: "조건 적용", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("1~366일");
  expect(state.calls.length).toBe(calls);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
