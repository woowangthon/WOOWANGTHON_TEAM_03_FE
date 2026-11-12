import { test, expect } from "@playwright/test";
import { admin, employee, installAuthFixture } from "./auth-fixture.js";

test("outlined login fields keep their labels clear before and after input", async ({
  page,
}, testInfo) => {
  await installAuthFixture(page);
  await page.goto("/");
  await expect(page.locator(".brand")).toHaveText("Mask Assistant");
  const password = page.getByLabel("비밀번호", { exact: true });
  await password.fill("SyntheticOnly9!");
  await expect(password).toHaveValue("SyntheticOnly9!");
  await expect(page.locator(".md-field-control").first()).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await page.screenshot({
    path: testInfo.outputPath("outlined-login-desktop.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("outlined-login-mobile.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("profile popup and itemized password help stay inside the narrow screen", async ({
  page,
}, testInfo) => {
  await installAuthFixture(page, { signedIn: employee });
  await page.goto("/account");
  await page.setViewportSize({ width: 390, height: 844 });
  const help = page.getByRole("button", { name: "비밀번호 규칙", exact: true });
  await help.click();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip.getByRole("listitem")).toHaveCount(4);
  const bounds = await tooltip.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("password-help-mobile.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await expect(tooltip).toBeHidden();
  await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
  await page.getByRole("button", { name: "내 계정 메뉴", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "계정 정보", exact: true }),
  ).toContainText(employee.username);
  await page.screenshot({
    path: testInfo.outputPath("profile-popup-mobile.png"),
    fullPage: true,
  });
});

test("user profile shows identity and its actions separately from the list", async ({
  page,
}, testInfo) => {
  await installAuthFixture(page, { signedIn: admin });
  await page.goto("/admin/users");
  await expect(
    page.getByRole("button", { name: "이름 변경", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: `${employee.full_name} 계정 상세 보기`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("region", { name: "사용자 정보", exact: true }),
  ).toContainText(employee.id);
  await page.screenshot({
    path: testInfo.outputPath("user-profile.png"),
    fullPage: true,
  });
});
