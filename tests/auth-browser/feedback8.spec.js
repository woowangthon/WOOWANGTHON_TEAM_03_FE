import { test, expect } from "@playwright/test";
import { admin, installAuthFixture } from "./auth-fixture.js";
import { installAudit } from "./admin-fixture.js";
import { openAccountPopup, openFilters } from "../helpers/ui.js";

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`login branding loads and account popup stays anchored at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await installAuthFixture(page);
    await page.goto("/");
    await expect(
      page.getByRole("heading", {
        name: "문서 속 민감정보를 먼저 살펴볼게요.",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "마스킹 내용을 확인하고, 승인한 내용으로 AI와 작업하세요.",
      ),
    ).toBeVisible();
    const brandIcon = page.locator(".brand-symbol");
    await expect
      .poll(() => brandIcon.evaluate((image) => image.naturalWidth))
      .toBeGreaterThan(0);
    expect(
      await page.locator('link[rel="icon"]').evaluate((link) => link.href),
    ).toBe(await brandIcon.evaluate((image) => image.currentSrc));
    await expect(page.getByLabel("로그인 ID", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({
      path: testInfo.outputPath("login.png"),
      fullPage: true,
    });
    await page.unrouteAll({ behavior: "wait" });
    await installAuthFixture(page, { signedIn: admin });
    await page.goto("/admin/users");
    for (let attempt = 0; attempt < 2; attempt++) {
      const popup = await openAccountPopup(page);
      const trigger = page.getByRole("button", {
        name: "내 계정 메뉴",
        exact: true,
      });
      const anchor = await trigger.boundingBox();
      const panel = await popup.boundingBox();
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(viewport.width);
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(
        Math.abs(anchor.y - panel.y - panel.height - 4),
      ).toBeLessThanOrEqual(3);
      await expect(
        popup.getByRole("button", { name: "계정 설정", exact: true }),
      ).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(
        popup.getByRole("button", { name: "로그아웃", exact: true }),
      ).toBeFocused();
      await page.screenshot({
        path: testInfo.outputPath(`account-${attempt}.png`),
      });
      await page.keyboard.press("Escape");
      await expect(popup).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  });

  test(`select opening and keyboard selection preserve page scroll at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await installAudit(page);
    await page.goto("/admin/audit");
    await openFilters(page);
    const trigger = page.getByRole("combobox", {
      name: "요청 상태",
      exact: true,
    });
    await trigger.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    await trigger.click();
    const list = page.getByRole("listbox", { name: "요청 상태", exact: true });
    await expect(list).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await page.keyboard.press("End");
    const active = await trigger.getAttribute("aria-activedescendant");
    const selected = page.locator(`[id="${active}"]`);
    const itemBox = await selected.boundingBox();
    const listBox = await list.boundingBox();
    expect(itemBox.y).toBeGreaterThanOrEqual(listBox.y - 1);
    expect(itemBox.y + itemBox.height).toBeLessThanOrEqual(
      listBox.y + listBox.height + 1,
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await page.screenshot({ path: testInfo.outputPath("select.png") });
    await page.keyboard.press("Enter");
    await expect(list).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
}

test("dashboard uses descriptive metric labels and detection units", async ({
  page,
}, testInfo) => {
  await installAudit(page);
  await page.goto("/admin");
  for (const [key, label] of [
    ["total_requests", "접수된 요청(건)"],
    ["detection_count", "민감정보가 발견된 곳"],
    ["inspection_anomalies", "검사가 불완전하거나 실패한 요청(건)"],
    ["policy_blocked_requests", "보안 정책으로 차단된 요청(건)"],
    ["external_sent_confirmed_requests", "외부 AI 전송이 확인된 요청(건)"],
  ])
    await expect(
      page.getByTestId(`metric-${key}`).getByText(label, { exact: true }),
    ).toBeVisible();
  await expect(page.getByTestId("metric-detection_count")).toContainText("곳");
  await page.screenshot({
    path: testInfo.outputPath("dashboard.png"),
    fullPage: true,
  });
});
