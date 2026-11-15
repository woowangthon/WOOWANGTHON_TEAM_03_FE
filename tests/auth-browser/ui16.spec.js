import { test, expect } from "@playwright/test";
import { admin, employee, installAuthFixture } from "./auth-fixture.js";
import { installAudit } from "./admin-fixture.js";
import { auditId, auditUser, complete, statistics } from "../fixtures/admin.js";
import { openFilters, selectOption } from "../helpers/ui.js";

test("password setup and reset reveal shared bold rules only through the help control", async ({
  page,
}, testInfo) => {
  await installAuthFixture(page, { signedIn: admin });
  const checkRules = async (label) => {
    const field = page.getByLabel(label, { exact: true });
    const rules = page.locator(".password-rules");
    const trigger = page.getByRole("button", {
      name: "비밀번호 규칙",
      exact: true,
    });
    await expect(field).toBeVisible();
    await expect(rules).toBeHidden();
    await trigger.hover();
    await expect(rules).toBeVisible();
    await expect(rules).toHaveAttribute("role", "tooltip");
    await expect(rules.getByRole("listitem")).toHaveCount(4);
    await expect(rules).toHaveCSS("font-weight", "700");
    await expect(trigger).toHaveAttribute(
      "aria-describedby",
      await rules.getAttribute("id"),
    );
    const color = await rules.evaluate((node) => getComputedStyle(node).color);
    expect(
      color
        .match(/\d+/g)
        .slice(0, 3)
        .every((channel) => Number(channel) < 40),
    ).toBe(true);
    await page.mouse.move(0, 0);
    await expect(rules).toBeHidden();
    await trigger.focus();
    await expect(rules).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(rules).toBeHidden();
    await expect(trigger).toBeFocused();
  };
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "＋ 계정 발급", exact: true }).click();
  await checkRules("초기 비밀번호");
  await page.goto(`/admin/users/${employee.id}/password`);
  await checkRules("새 비밀번호");
  await page
    .getByRole("button", { name: "비밀번호 규칙", exact: true })
    .click();
  await page.screenshot({
    path: testInfo.outputPath("password-rules.png"),
    animations: "disabled",
  });
  await page.goto("/account");
  await checkRules("새 비밀번호 확인");
});

test("login password has a helpful prompt while simplified employee composer preserves an accessible send action", async ({
  page,
}) => {
  await installAuthFixture(page);
  await page.goto("/");
  await expect(page.locator(".brand")).toContainText("Mask Assistant");
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveAttribute(
    "placeholder",
    /비밀번호/,
  );
  await page.getByLabel("비밀번호", { exact: true }).fill("SyntheticOnly9!");
  await page
    .getByRole("button", { name: "비밀번호 보기", exact: true })
    .click();
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await page
    .getByRole("button", { name: "비밀번호 숨기기", exact: true })
    .click();
  await expect(page.getByLabel("비밀번호", { exact: true })).toHaveAttribute(
    "type",
    "password",
  );
  await expect(
    page.getByText("검사 → 전송 확인 → 답변", { exact: true }),
  ).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
  const state = await installAuthFixture(page, { signedIn: employee });
  await page.goto("/");
  const send = page.getByRole("button", { name: "요청 접수", exact: true });
  await expect(send).toBeVisible();
  await expect(send).toBeDisabled();
  await expect(send.locator("svg")).toBeVisible();
  await page.getByLabel("요청 내용", { exact: true }).fill("짧은 가상 요청문");
  await expect(send).toBeEnabled();
  await expect(
    page.getByText(/Enter로 접수 · Shift\+Enter로 줄바꿈/),
  ).toHaveCount(0);
  await expect(
    page.getByText(/스캔 PDF의 본문 인식은 이 접수 단계에서 확인하지 않습니다/),
  ).toHaveCount(0);
  expect(state.calls.some((call) => call === "POST /requests/")).toBe(false);
});

test("M3 select exposes a styled option list and supports keyboard selection and Escape focus recovery", async ({
  page,
}) => {
  await installAuthFixture(page, { signedIn: admin });
  await page.goto("/admin/users");
  const trigger = page.getByRole("combobox", {
    name: "계정 상태",
    exact: true,
  });
  await expect(trigger).toBeVisible();
  expect(await trigger.evaluate((node) => node.tagName)).not.toBe("SELECT");
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(
    page.getByRole("option", { name: "비활성 계정", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(trigger).toContainText("전체 계정");
  await expect(
    page.getByRole("cell", { name: "USER0002", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("separate audit page hides receipt IDs and PDF column and restores filters and page after detail", async ({
  page,
}) => {
  const { state } = await installAudit(page);
  await page.goto("/admin");
  await expect(page.getByTestId("metric-total_requests")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "관리자 요청 목록" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "요청 감사 목록", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/audit(?:\?|$)/);
  await expect(
    page.getByRole("heading", { name: "요청 감사 목록", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "관리자 요청 목록" })
      .getByRole("cell", { name: auditUser.full_name, exact: true }),
  ).toBeVisible();
  await openFilters(page);
  await page
    .getByLabel("이용자·파일명 검색", { exact: true })
    .fill("감사 시험");
  await page.getByRole("button", { name: "조건 적용", exact: true }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("감사 시험");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const list = page.getByRole("region", { name: "관리자 요청 목록" });
  await expect(list.getByText("2 / 2페이지")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("q")).toBe("감사 시험");
  expect(state.calls.at(-1).query.q).toBe("감사 시험");
  await expect(
    list.getByRole("columnheader", { name: "입력 PDF", exact: true }),
  ).toHaveCount(0);
  await expect(
    list.getByRole("columnheader", { name: /이용자/ }),
  ).toBeVisible();
  await expect(list).toContainText(auditUser.full_name);
  await expect(list).not.toContainText(auditId);
  await expect(page.getByLabel("접수 번호", { exact: true })).toHaveCount(0);
  const detail = page.getByRole("button", {
    name: `${auditUser.full_name} 요청 상세 보기`,
    exact: true,
  });
  await expect(detail.locator("svg")).toBeVisible();
  await expect(detail).toHaveText("");
  await detail.click();
  await expect(page).toHaveURL(new RegExp(`/admin/audit/${auditId}(?:\\?|$)`));
  await expect(
    page.getByRole("region", { name: "요청 검사 상세", exact: true }),
  ).toBeVisible();
  await expect(list).toHaveCount(0);
  await page.getByRole("button", { name: "뒤로가기", exact: true }).click();
  await openFilters(page);
  await expect(
    page.getByLabel("이용자·파일명 검색", { exact: true }),
  ).toHaveValue("감사 시험");
  await expect(list.getByText("2 / 2페이지")).toBeVisible();
});

for (const [button, suffix] of [
  ["이름 변경", "name"],
  ["비밀번호 재설정", "password"],
]) {
  test(`user profile opens ${button} and returns through the profile without losing list search`, async ({
    page,
  }) => {
    const state = await installAuthFixture(page, { signedIn: admin });
    await page.goto("/admin/users");
    await page.getByPlaceholder("ID 또는 이름 검색").fill(employee.username);
    const row = page.getByRole("row").filter({ hasText: employee.username });
    const inspect = row.getByRole("button", {
      name: `${employee.full_name} 계정 상세 보기`,
      exact: true,
    });
    await expect(row.getByRole("button")).toHaveCount(1);
    await expect(inspect.locator("svg")).toBeVisible();
    await inspect.click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/users/${employee.id}(?:\\?|$)`),
    );
    const profile = page.getByRole("region", {
      name: "사용자 정보",
      exact: true,
    });
    await expect(
      profile.getByText(employee.username, { exact: true }),
    ).toBeVisible();
    await expect(
      profile.getByText(employee.full_name, { exact: true }),
    ).toBeVisible();
    await expect(profile.getByText(employee.id, { exact: true })).toBeVisible();
    await profile.getByRole("button", { name: button, exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/users/${employee.id}/${suffix}(?:\\?|$)`),
    );
    await expect(
      page.getByRole("heading", { name: button, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("cell", { name: employee.username, exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "뒤로가기", exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/users/${employee.id}(?:\\?|$)`),
    );
    await expect(profile).toBeVisible();
    await page.getByRole("button", { name: "뒤로가기", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/users(?:\?|$)/);
    await expect(page.getByPlaceholder("ID 또는 이름 검색")).toHaveValue(
      employee.username,
    );
    await expect(row).toBeVisible();
    expect(
      state.calls.some((call) => /^(POST|PATCH) \/admin\/users\//.test(call)),
    ).toBe(false);
  });
}

test("quick period control changes server dates and the daily chart has no duplicate numerical table", async ({
  page,
}) => {
  const { state } = await installAudit(page);
  await page.goto("/admin");
  await expect(
    page.getByRole("img", { name: "접수된 요청 일별 추이" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "최근 1일", exact: true }).click();
  await openFilters(page);
  await expect
    .poll(() => state.calls.at(-1)?.query.date_from)
    .toBe(await page.getByLabel("시작일", { exact: true }).inputValue());
  const last = state.calls.at(-1).query;
  expect(last.date_from).toBe(last.date_to);
  await expect(page.getByText(/일별 수치\s*표/)).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "접수된 요청 일별 추이" }),
  ).toBeVisible();
});

test("M3 calendar supports keyboard date selection and fits a narrow viewport", async ({
  page,
}) => {
  const { state } = await installAudit(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/audit");
  await openFilters(page);
  const start = page.getByLabel("시작일", { exact: true });
  await start.fill("2026-11-10");
  await page.getByLabel("종료일", { exact: true }).fill("2026-11-30");
  const originalCalls = state.calls.length;
  const trigger = page.getByRole("button", {
    name: "시작일 달력 열기",
    exact: true,
  });
  await trigger.click();
  const calendar = page.getByRole("dialog", {
    name: "2026년 11월",
    exact: true,
  });
  await expect(calendar).toBeVisible();
  await expect(
    calendar.getByRole("button", { name: "2026-11-10", exact: true }),
  ).toBeFocused();
  const bounds = await calendar.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(start).toHaveValue("2026-11-11");
  await expect(calendar).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(state.calls.length).toBe(originalCalls);
});

test("collapsed audit filters preserve unsaved drafts without changing the applied query", async ({
  page,
}) => {
  const { state } = await installAudit(page);
  await page.goto("/admin/audit");
  await expect(
    page.getByRole("button", {
      name: `${auditUser.full_name} 요청 상세 보기`,
      exact: true,
    }),
  ).toBeVisible();
  const toggle = page.getByRole("button", { name: "조회 조건", exact: true });
  const search = page.getByLabel("이용자·파일명 검색", { exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(search).toBeHidden();
  const before = state.calls.length;
  await openFilters(page);
  await search.fill("작성 중인 조건");
  await selectOption(page, "검사 상태", "불완전 검사");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(search).toBeHidden();
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  expect(state.calls.length).toBe(before);
  await openFilters(page);
  await expect(search).toHaveValue("작성 중인 조건");
  await expect(
    page.getByRole("combobox", { name: "검사 상태", exact: true }),
  ).toContainText("불완전 검사");
  expect(state.calls.length).toBe(before);
  await page.getByRole("button", { name: "조건 적용", exact: true }).click();
  await expect
    .poll(() => state.calls.at(-1)?.query)
    .toMatchObject({ q: "작성 중인 조건", inspection_status: "degraded" });
  await page.reload();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await openFilters(page);
  await expect(search).toHaveValue("작성 중인 조건");
  await expect(
    page.getByRole("combobox", { name: "검사 상태", exact: true }),
  ).toContainText("불완전 검사");
});

test("thirty-day charts initially show the latest date and retain user scroll across automatic refresh", async ({
  page,
}) => {
  await page.clock.install();
  await page.setViewportSize({ width: 800, height: 700 });
  await installAudit(page);
  let reads = 0;
  await page.route(
    (url) => url.pathname === "/api/v1/admin/statistics/",
    async (route) => {
      reads += 1;
      const filters = Object.fromEntries(
        new URL(route.request().url()).searchParams,
      );
      const response = statistics(filters);
      const start = Date.parse(`${filters.date_from}T00:00:00Z`);
      const end = Date.parse(`${filters.date_to}T00:00:00Z`);
      response.daily = Array.from(
        { length: Math.round((end - start) / 86400000) + 1 },
        (_, index) => ({
          date: new Date(start + index * 86400000).toISOString().slice(0, 10),
          metrics: Object.fromEntries(
            Object.keys(response.summary.metrics).map((key) => [
              key,
              complete(index + reads),
            ]),
          ),
          coverage: response.summary.coverage,
        }),
      );
      await route.fulfill({ json: response });
    },
  );
  await page.goto("/admin");
  await expect(page.getByTestId("metric-total_requests")).toBeVisible();
  await page.getByRole("button", { name: "최근 30일", exact: true }).click();
  const chart = page.getByRole("img", {
    name: "접수된 요청 일별 추이",
    exact: true,
  });
  await expect(chart.locator(".audit-bar-column")).toHaveCount(30);
  expect(
    await chart.evaluate((node) => node.scrollWidth > node.clientWidth),
  ).toBe(true);
  await expect
    .poll(() =>
      chart.evaluate((node) =>
        Math.abs(node.scrollLeft - (node.scrollWidth - node.clientWidth)),
      ),
    )
    .toBeLessThanOrEqual(2);
  const lastDate = new URL(page.url()).searchParams.get("date_to");
  await expect(chart.locator(".audit-bar-column").last()).toHaveAttribute(
    "aria-label",
    new RegExp(`^${lastDate}:`),
  );
  await chart.evaluate((node) => {
    node.scrollLeft = 120;
  });
  const chosenOffset = await chart.evaluate((node) => node.scrollLeft);
  expect(chosenOffset).toBe(120);
  const before = reads;
  const beforeValue = await chart
    .locator(".audit-bar-column")
    .first()
    .getAttribute("aria-label");
  await page.clock.runFor(30001);
  await expect.poll(() => reads).toBe(before + 1);
  await expect(chart.locator(".audit-bar-column").first()).not.toHaveAttribute(
    "aria-label",
    beforeValue,
  );
  await expect
    .poll(() => chart.evaluate((node) => node.scrollLeft))
    .toBe(chosenOffset);
});

test("user profile saves the exact account name and returns to the preserved list search", async ({
  page,
}) => {
  const state = await installAuthFixture(page, { signedIn: admin });
  await page.goto("/admin/users");
  await page.getByPlaceholder("ID 또는 이름 검색").fill(employee.username);
  await page
    .getByRole("button", {
      name: `${employee.full_name} 계정 상세 보기`,
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "이름 변경", exact: true }).click();
  await page.getByLabel("이름", { exact: true }).fill("변경된 가상 직원");
  await page.getByRole("button", { name: "이름 변경", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/users/${employee.id}(?:\\?|$)`),
  );
  const profile = page.getByRole("region", {
    name: "사용자 정보",
    exact: true,
  });
  await expect(
    profile.getByText("변경된 가상 직원", { exact: true }),
  ).toBeVisible();
  await expect(profile.getByText(employee.id, { exact: true })).toBeVisible();
  expect(
    state.calls.filter((call) => call.startsWith("PATCH /admin/users/")),
  ).toEqual([`PATCH /admin/users/${employee.id}/name/`]);
  await page.getByRole("button", { name: "뒤로가기", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users(?:\?|$)/);
  await expect(page.getByPlaceholder("ID 또는 이름 검색")).toHaveValue(
    employee.username,
  );
  await expect(
    page.getByRole("cell", { name: "변경된 가상 직원", exact: true }),
  ).toBeVisible();
});

test("inactive user profiles remain readable after reload and cannot mutate the account", async ({
  page,
}) => {
  const state = await installAuthFixture(page, { signedIn: admin });
  const inactive = state.users.find((user) => !user.is_active);
  await page.goto("/admin/users");
  await selectOption(page, "계정 상태", "전체 계정");
  const inspect = page.getByRole("button", {
    name: `${inactive.full_name} 계정 상세 보기`,
    exact: true,
  });
  await expect(inspect).toBeEnabled();
  await inspect.click();
  await expect(page).toHaveURL(
    new RegExp(`/admin/users/${inactive.id}(?:\\?|$)`),
  );
  await page.reload();
  const profile = page.getByRole("region", {
    name: "사용자 정보",
    exact: true,
  });
  for (const value of [
    inactive.username,
    inactive.full_name,
    inactive.id,
    "비활성",
  ]) {
    await expect(profile.getByText(value, { exact: true })).toBeVisible();
  }
  for (const name of ["이름 변경", "비밀번호 재설정", "비활성화"]) {
    await expect(
      profile.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  }
  expect(
    state.calls.some((call) => /^(POST|PATCH) \/admin\/users\//.test(call)),
  ).toBe(false);
  await page.getByRole("button", { name: "뒤로가기", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "계정 상태", exact: true }),
  ).toContainText("전체 계정");
  await expect(
    page.getByRole("cell", { name: inactive.username, exact: true }),
  ).toBeVisible();
});
