import { test, expect } from "@playwright/test";
import { admin, employee, installAuthFixture } from "./auth-fixture.js";
import { installAudit } from "./admin-fixture.js";
import { auditId, auditUser } from "../fixtures/admin.js";

test("password setup and reset show shared bold dark rules below fields", async ({
  page,
}, testInfo) => {
  await installAuthFixture(page, { signedIn: admin });
  const checkRules = async (label) => {
    const field = page.getByLabel(label, { exact: true });
    const rules = page.locator(".password-rules");
    await expect(rules).toBeVisible();
    await expect(rules).toHaveCSS("font-weight", "700");
    await expect(field).toHaveAttribute(
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
    const inputBox = await field.boundingBox();
    const rulesBox = await rules.boundingBox();
    expect(rulesBox.y).toBeGreaterThan(inputBox.y + inputBox.height);
  };
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "＋ 계정 발급", exact: true }).click();
  await checkRules("초기 비밀번호");
  await page.goto(`/admin/users/${employee.id}/password`);
  await checkRules("새 비밀번호");
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
  await expect(page.locator(".brand")).toContainText("마스킹 어시스턴트");
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
  const topLine = detail.getByText("상세", { exact: true });
  const bottomLine = detail.getByText("보기", { exact: true });
  await expect(topLine).toBeVisible();
  await expect(bottomLine).toBeVisible();
  const firstBounds = await topLine.boundingBox();
  const secondBounds = await bottomLine.boundingBox();
  expect(secondBounds.y).toBeGreaterThanOrEqual(
    firstBounds.y + firstBounds.height,
  );
  await detail.click();
  await expect(page).toHaveURL(new RegExp(`/admin/audit/${auditId}(?:\\?|$)`));
  await expect(
    page.getByRole("region", { name: "요청 검사 상세", exact: true }),
  ).toBeVisible();
  await expect(list).toHaveCount(0);
  await page.getByRole("button", { name: "뒤로가기", exact: true }).click();
  await expect(
    page.getByLabel("이용자·파일명 검색", { exact: true }),
  ).toHaveValue("감사 시험");
  await expect(list.getByText("2 / 2페이지")).toBeVisible();
});

for (const [button, suffix] of [
  ["이름 변경", "name"],
  ["비밀번호 재설정", "password"],
]) {
  test(`user ${button} opens a separate page and back preserves search without a mutation`, async ({
    page,
  }) => {
    const state = await installAuthFixture(page, { signedIn: admin });
    await page.goto("/admin/users");
    await page.getByPlaceholder("ID 또는 이름 검색").fill(employee.username);
    const row = page.getByRole("row").filter({ hasText: employee.username });
    await row.getByRole("button", { name: button, exact: true }).click();
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
    page.getByRole("img", { name: "전체 요청 일별 추이" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "최근 1일", exact: true }).click();
  await expect
    .poll(() => state.calls.at(-1)?.query.date_from)
    .toBe(await page.getByLabel("시작일", { exact: true }).inputValue());
  const last = state.calls.at(-1).query;
  expect(last.date_from).toBe(last.date_to);
  await expect(page.getByText(/일별 수치\s*표/)).toHaveCount(0);
  await expect(
    page.getByRole("img", { name: "전체 요청 일별 추이" }),
  ).toBeVisible();
});

test("M3 calendar supports keyboard date selection and fits a narrow viewport", async ({
  page,
}) => {
  const { state } = await installAudit(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/audit");
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
