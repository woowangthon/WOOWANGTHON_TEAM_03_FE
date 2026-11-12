import { test, expect } from "@playwright/test";
import { employee, installAuthFixture } from "./auth-fixture.js";
import { installAudit } from "./admin-fixture.js";
import { auditId, auditUser, auditDetailFixture } from "../fixtures/admin.js";
import { openFilters, selectOption } from "../helpers/ui.js";

const detailRegion = (page) =>
  page.getByRole("region", { name: "요청 검사 상세", exact: true });
const detailButton = (page) =>
  page.getByRole("button", {
    name: `${auditUser.full_name} 요청 상세 보기`,
    exact: true,
  });
const auditList = (page) =>
  page.getByRole("region", { name: "관리자 요청 목록" });

test("audit explains failures and warnings separately from delivery confirmation on its own page", async ({
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
  await page.goto("/admin/audit");
  const row = page.getByRole("row").filter({ hasText: auditUser.full_name });
  await expect(row).toContainText("불완전 검사");
  await expect(row).toContainText("AI 지시문으로 의심");
  await expect(row).toContainText(
    "등록되지 않은 경고 코드입니다. (FUTURE_WARNING)",
  );
  await expect(row).toContainText(
    "탐지 구간을 온전히 저장하지 못해 처리를 중단했습니다. (SPAN_SAVE_SKIPPED)",
  );
  expect((await row.boundingBox()).height).toBeLessThan(300);
  await detailButton(page).click();
  await expect(page).toHaveURL(new RegExp(`/admin/audit/${auditId}(?:\\?|$)`));
  await expect(auditList(page)).toHaveCount(0);
  const detail = detailRegion(page);
  await expect(detail).toContainText("민감정보 검사");
  await expect(detail).toContainText("가림 결과가 검사 결과와 달라");
  await expect(detail).toContainText("MASK_MISMATCH");
  await expect(detail).toContainText("외부 전송 확인");
  await expect(page.locator("body")).not.toContainText("SECRET");
});

test("dashboard preserves unknown and partial metrics instead of rendering them as actual zero", async ({
  page,
}) => {
  const { state } = await installAudit(page);
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
  await selectOption(page, "차트 지표", "경고 요청");
  await expect(
    page.getByRole("img", { name: "경고 요청 일별 추이" }),
  ).toContainText("미확정");
  await expect(auditList(page)).toHaveCount(0);
  expect(state.calls.every((call) => call.path.endsWith("/statistics/"))).toBe(
    true,
  );
});

test("audit filters and pagination use only the list API, while detail excludes other users' answers", async ({
  page,
}) => {
  const { auth, state } = await installAudit(page);
  await page.goto("/admin/audit");
  await detailButton(page).click();
  const detail = detailRegion(page);
  await expect(detail).toContainText("비활성 계정");
  await detail.getByText("요청문·검사 원문 보기", { exact: true }).click();
  await expect(detail).toContainText("가상 의뢰문입니다.");
  await detail.getByText("탐지 구간·가림 대응표 보기", { exact: true }).click();
  await expect(detail).toContainText("[[ORG_1]]");
  await expect(page.locator("body")).not.toContainText("SECRET");
  await page.getByRole("button", { name: "뒤로가기", exact: true }).click();
  await openFilters(page);
  await page.getByLabel("이용자·파일명 검색", { exact: true }).fill("USER0001");
  await selectOption(page, "요청 상태", "정책 차단");
  await selectOption(page, "처리 경로", "외부");
  await selectOption(page, "탐지 분류", "회사명");
  await selectOption(page, "경고 여부", "있음");
  await selectOption(page, "검사 상태", "불완전 검사");
  await selectOption(page, "검사 이상", "이상 · 불완전 검사 또는 실패");
  await page.getByRole("button", { name: "조건 적용", exact: true }).click();
  await expect
    .poll(
      () => state.calls.filter((call) => call.query.state === "blocked").length,
    )
    .toBe(1);
  expect(state.calls.at(-1).query).toMatchObject({
    q: "USER0001",
    state: "blocked",
    processing_route: "external",
    detection_label: "company",
    has_warnings: "true",
    inspection_status: "degraded",
    inspection_anomaly: "true",
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(auditList(page).getByText("2 / 2페이지")).toBeVisible();
  expect(state.calls.at(-1).query.page).toBe("2");
  expect(state.calls.some((call) => call.path.endsWith("/statistics/"))).toBe(
    false,
  );
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
  await page.goto("/admin/audit");
  const list = auditList(page);
  await expect(list.getByText("경고 미확정", { exact: true })).toBeVisible();
  await list.getByRole("button", { name: "다음", exact: true }).click();
  await expect(list.getByText("2 / 2페이지")).toBeVisible();
  state.totals = { list: 1, statistics: 1 };
  await openFilters(page);
  await selectOption(page, "경고 여부", "없음 · 검사 완료");
  await selectOption(page, "검사 상태", "검사 완료");
  await selectOption(page, "검사 이상", "정상 · 검사 완료");
  await page.getByRole("button", { name: "조건 적용", exact: true }).click();
  await expect(list.getByText("1 / 1페이지")).toBeVisible();
  await expect(list.getByText("경고 없음", { exact: true })).toBeVisible();
  expect(state.calls.at(-1).query).toMatchObject({
    page: "1",
    page_size: "20",
    has_warnings: "false",
    inspection_status: "complete",
    inspection_anomaly: "false",
  });
});

for (const [path, visible] of [
  ["/admin", "metric"],
  ["/admin/audit", "list"],
]) {
  test(`${path} refresh waits for completion, ignores old filters and stops after navigation`, async ({
    page,
  }) => {
    await page.clock.install();
    const { state } = await installAudit(page);
    await page.goto(path);
    const content =
      visible === "metric"
        ? page.getByTestId("metric-total_requests")
        : detailButton(page);
    await expect(content).toBeVisible();
    const original = state.calls.length;
    let release;
    state.delay = new Promise((resolve) => {
      release = resolve;
    });
    await page.clock.runFor(30001);
    await expect.poll(() => state.calls.length).toBe(original + 1);
    await page.clock.runFor(60000);
    expect(state.calls.length).toBe(original + 1);
    await openFilters(page);
    await page
      .getByLabel("이용자·파일명 검색", { exact: true })
      .fill("최신조건");
    await page.getByRole("button", { name: "조건 적용", exact: true }).click();
    await expect
      .poll(() => state.calls.some((call) => call.query.q === "최신조건"))
      .toBe(true);
    release();
    await expect(content).toBeVisible();
    await page.getByRole("link", { name: "사용자 관리", exact: true }).click();
    const afterLeave = state.calls.length;
    await page.clock.runFor(60000);
    expect(state.calls.length).toBe(afterLeave);
    await expect(content).toHaveCount(0);
  });

  test(`${path} failed refresh is an error and revoked permission clears the previous data`, async ({
    page,
  }) => {
    const { state } = await installAudit(page);
    await page.goto(path);
    const content =
      visible === "metric"
        ? page.getByTestId("metric-total_requests")
        : detailButton(page);
    await expect(content).toBeVisible();
    state.failure = { status: 503, code: "ADMIN_READ_FAILED" };
    await page.getByRole("button", { name: "새로고침", exact: true }).click();
    await expect(page.getByText(/(?:통계|목록) 조회 실패:/)).toBeVisible();
    await expect(content).toHaveCount(0);
    await expect(page.getByText("해당하는 요청이 없습니다")).toHaveCount(0);
    state.failure = { status: 403, code: "FORBIDDEN" };
    await page.getByRole("button", { name: "새로고침", exact: true }).click();
    await expect(page.getByText(/이전 조회 자료를 닫았습니다/)).toBeVisible();
    await expect(content).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "내 계정 메뉴", exact: true }),
    ).toBeVisible();
  });
}

test("revoked detail permission clears its sensitive data and retains the authenticated session", async ({
  page,
}) => {
  const { state } = await installAudit(page);
  await page.goto(`/admin/audit/${auditId}`);
  await expect(detailRegion(page)).toContainText("비활성 계정");
  state.failure = { status: 403, code: "FORBIDDEN" };
  await page
    .getByRole("button", { name: "상세 다시 조회", exact: true })
    .click();
  await expect(page.getByText(/이전 조회 자료를 닫았습니다/)).toBeVisible();
  await expect(detailRegion(page)).toHaveCount(0);
  await expect(page.getByText("가상 의뢰문입니다.")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "내 계정 메뉴", exact: true }),
  ).toBeVisible();
});

test("403 AUTH_REQUIRED removes protected UI and ordinary users never query any admin page API", async ({
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
  for (const path of [
    "/admin",
    "/admin/audit",
    `/admin/audit/${auditId}`,
    "/admin/users",
    `/admin/users/${employee.id}`,
    `/admin/users/${employee.id}/password`,
  ]) {
    await page.goto(path);
    await expect(page.getByRole("alert")).toContainText("관리자만 접근");
  }
  expect(userAuth.calls.some((call) => call.includes("/admin/"))).toBe(false);
});

test("a stalled list read cannot reopen sensitive data after the detail route denies permission", async ({
  page,
}) => {
  await page.clock.install();
  const { state } = await installAudit(page);
  await page.goto("/admin/audit");
  await expect(detailButton(page)).toBeVisible();
  let release;
  state.delay = new Promise((resolve) => {
    release = resolve;
  });
  const before = state.calls.length;
  await page.clock.runFor(30001);
  await expect.poll(() => state.calls.length).toBe(before + 1);
  state.failure = { status: 403, code: "FORBIDDEN" };
  await detailButton(page).click();
  await expect(page.getByText(/이전 조회 자료를 닫았습니다/)).toBeVisible();
  await expect(detailRegion(page)).toHaveCount(0);
  await expect(auditList(page)).toHaveCount(0);
  release();
  await page.clock.runFor(1000);
  await expect(detailRegion(page)).toHaveCount(0);
  await expect(auditList(page)).toHaveCount(0);
});

test("date validation and mobile audit layout stay usable", async ({
  page,
}) => {
  const { state } = await installAudit(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/audit");
  await expect(detailButton(page)).toBeVisible();
  const calls = state.calls.length;
  await openFilters(page);
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
