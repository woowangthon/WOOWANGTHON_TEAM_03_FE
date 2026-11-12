import { test, expect } from "@playwright/test";
import { admin, employee, installAuthFixture } from "./auth-fixture.js";
import { installAudit } from "./admin-fixture.js";
import { auditId, auditUser } from "../fixtures/admin.js";

test("audit detail survives direct entry and reload, then returns to the filtered list", async ({
  page,
}) => {
  await installAudit(page);
  await page.goto(`/admin/audit/${auditId}?q=감사&page=2`);
  const detail = page.getByRole("region", {
    name: "요청 검사 상세",
    exact: true,
  });
  await expect(detail).toBeVisible();
  await page.reload();
  await expect(detail).toBeVisible();
  await page.getByRole("button", { name: "뒤로가기", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/audit\?q=.*page=2/);
  await expect(
    page.getByLabel("이용자·파일명 검색", { exact: true }),
  ).toHaveValue("감사");
  await expect(page.getByText("2 / 2페이지", { exact: true })).toBeVisible();
});

test("direct user edit resolves the exact account after reload and never edits an absent account", async ({
  page,
}) => {
  const state = await installAuthFixture(page, { signedIn: admin });
  await page.goto(`/admin/users/${employee.id}/name?status=all`);
  await expect(page.getByLabel("이름", { exact: true })).toHaveValue(
    employee.full_name,
  );
  await page.reload();
  await expect(page.getByLabel("이름", { exact: true })).toHaveValue(
    employee.full_name,
  );
  await page.getByLabel("이름", { exact: true }).fill("직접 진입 시험");
  await page.getByRole("button", { name: "이름 변경", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "직접 진입 시험", exact: true }),
  ).toBeVisible();
  await page.goto("/admin/users/99999999-9999-4999-8999-999999999999/password");
  await expect(page.getByRole("alert")).toContainText(
    "사용자를 찾을 수 없습니다",
  );
  await expect(page.getByLabel("새 비밀번호", { exact: true })).toHaveCount(0);
  expect(
    state.calls.filter((call) => call.startsWith("PATCH /admin/users/")),
  ).toEqual([`PATCH /admin/users/${employee.id}/name/`]);
});

test("returning from a reloaded audit detail restores the list scroll position", async ({
  page,
}) => {
  await installAudit(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/admin/audit");
  const button = page.getByRole("button", {
    name: `${auditUser.full_name} 요청 상세 보기`,
  });
  await button.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);
  await button.click();
  await expect(
    page.getByRole("region", { name: "요청 검사 상세" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "요청 검사 상세" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "뒤로가기", exact: true }).click();
  await expect(button).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThanOrEqual(before - 2);
});

// Effective CSS viewports of a 1366×768 display at common browser zoom levels.
// This tests reflow, not the browser's own zoom-setting UI.
for (const [scale, width, height] of [
  [100, 1366, 768],
  [125, 1093, 614],
  [150, 911, 512],
  [200, 683, 384],
  ["mobile", 390, 844],
]) {
  test(`role screens and controls reflow at ${scale}% effective viewport`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    await installAudit(page);
    const withinPage = async () => {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
    };
    await page.goto("/admin");
    await expect(page.getByTestId("metric-total_requests")).toBeVisible();
    await withinPage();
    await page.screenshot({
      path: testInfo.outputPath(`dashboard-${scale}.png`),
      fullPage: true,
    });
    await page.goto("/admin/audit");
    const detail = page.getByRole("button", {
      name: `${auditUser.full_name} 요청 상세 보기`,
    });
    await expect(detail).toBeVisible();
    await detail.scrollIntoViewIfNeeded();
    const top = await detail.getByText("상세", { exact: true }).boundingBox();
    const bottom = await detail
      .getByText("보기", { exact: true })
      .boundingBox();
    expect(bottom.y).toBeGreaterThanOrEqual(top.y + top.height);
    await withinPage();
    const select = page.getByRole("combobox", {
      name: "검사 상태",
      exact: true,
    });
    await select.click();
    const menu = page.getByRole("listbox");
    await expect(menu).toBeVisible();
    const menuBounds = await menu.boundingBox();
    expect(menuBounds.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(width);
    expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(height);
    await page.screenshot({
      path: testInfo.outputPath(`audit-menu-${scale}.png`),
    });
    await page.keyboard.press("Escape");
    await page.unrouteAll({ behavior: "wait" });
    await installAuthFixture(page, { signedIn: employee });
    await page.goto("/");
    await page
      .getByLabel("요청 내용", { exact: true })
      .fill("화면 확대에서도 작성과 전송 버튼에 접근합니다.");
    const send = page.getByRole("button", { name: "요청 접수", exact: true });
    await expect(send).toBeEnabled();
    await send.scrollIntoViewIfNeeded();
    const sendBounds = await send.boundingBox();
    expect(sendBounds.x + sendBounds.width).toBeLessThanOrEqual(width);
    await withinPage();
    await page.screenshot({
      path: testInfo.outputPath(`employee-${scale}.png`),
      fullPage: true,
    });
    if (width < 840)
      await page.getByRole("button", { name: "메뉴 열기" }).click();
    await page.getByRole("button", { name: "계정 메뉴", exact: true }).click();
    const account = page.getByRole("menuitem", {
      name: "계정 설정",
      exact: true,
    });
    await expect(account).toBeVisible();
    const accountBounds = await account.boundingBox();
    expect(accountBounds.y).toBeGreaterThanOrEqual(0);
    expect(accountBounds.y + accountBounds.height).toBeLessThanOrEqual(height);
    await account.click();
    await expect(
      page.getByRole("heading", { name: "내 계정", exact: true }),
    ).toBeVisible();
    await withinPage();
  });
}

test("login visual review on desktop and mobile", async ({
  page,
}, testInfo) => {
  await installAuthFixture(page);
  for (const width of [1366, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByLabel("비밀번호", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`login-${width}.png`),
      fullPage: true,
    });
  }
});
