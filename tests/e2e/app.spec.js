import { test, expect } from "@playwright/test";

test("employee approval flow clears highlights and logout clears history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "직원으로 체험하기" }).click();
  await page.getByRole("button", { name: /외부 전송 확인/ }).click();
  await page.getByRole("button", { name: "검사 시작" }).click();
  await expect(
    page.getByRole("heading", { name: "외부로 보내기 전에 확인해 주세요" }),
  ).toBeVisible();
  await expect(page.locator("mark")).toHaveCount(2);
  await page.getByRole("button", { name: "가리고 보내기" }).click();
  await expect(page.locator("mark")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "답변 복사" })).toBeVisible();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.getByRole("button", { name: "직원으로 체험하기" }).click();
  await expect(page.getByText("첫 요청을 시작해 보세요.")).toBeVisible();
});
test("regular user cannot access admin route", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "직원으로 체험하기" }).click();
  await expect(page.getByRole("alert")).toContainText("관리자만 접근");
  await expect(
    page.getByRole("button", { name: "사용자 관리", exact: true }),
  ).toHaveCount(0);
});

test("approval expiry closes the confirmation details immediately after conflict", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "직원으로 체험하기" }).click();
  await page.getByRole("button", { name: /외부 전송 확인/ }).click();
  await page.getByRole("button", { name: "검사 시작" }).click();
  await expect(page.locator("mark")).toHaveCount(2);
  await page.clock.setFixedTime(new Date(Date.now() + 31 * 60 * 1000));
  await page.getByRole("button", { name: "가리고 보내기" }).click();
  await expect(
    page.getByRole("heading", { name: "승인 시간이 지났습니다" }),
  ).toBeVisible();
  await expect(page.locator("mark")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "가리고 보내기" })).toHaveCount(
    0,
  );
});
test("admin can filter mock users and see empty result", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "관리자로 체험하기" }).click();
  await page.getByRole("button", { name: "사용자 관리", exact: true }).click();
  await page
    .getByRole("combobox", { name: "계정 상태" })
    .selectOption("inactive");
  await expect(page.getByRole("cell", { name: "USER0003" })).toBeVisible();
  await page.getByPlaceholder("ID 또는 이름 검색").fill("없는계정");
  await expect(
    page.getByRole("heading", { name: "검색 결과가 없습니다" }),
  ).toBeVisible();
});

test("administrator has no employee workspace, history, or direct request route", async ({
  page,
}) => {
  await page.goto("/?request=someone-elses-request");
  await page.getByRole("button", { name: "관리자로 체험하기" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "보안 현황" })).toBeVisible();
  await expect(page.getByRole("link", { name: "AI 작업 공간" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "새 요청", exact: false }),
  ).toHaveCount(0);
  await expect(page.locator(".history-list")).toHaveCount(0);
  await expect(page.locator("textarea")).toHaveCount(0);
  await page.getByRole("link", { name: "내 계정" }).click();
  await expect(page.getByRole("heading", { name: "내 계정" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.getByRole("button", { name: "직원으로 체험하기" }).click();
  await expect(page.getByRole("link", { name: "AI 작업 공간" })).toBeVisible();
});
test("mobile layout stays within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "직원으로 체험하기" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await expect(page.getByRole("link", { name: "내 계정" })).toBeVisible();
});
test("narrow window drawer stays hidden until opened and closes from its scrim", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "직원으로 체험하기" }).click();
  const account = page.getByRole("link", { name: "내 계정" });
  await expect(account).toBeHidden();
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await expect(account).toBeVisible();
  // The open drawer covers the left side; click the scrim strip beside it.
  await page.locator(".scrim").click({ position: { x: 375, y: 400 } });
  await expect(account).toBeHidden();
  await expect(page.locator(".scrim")).toHaveCount(0);
});

for (const [role, buttonName] of [
  ["직원", "직원으로 체험하기"],
  ["관리자", "관리자로 체험하기"],
]) {
  test(`${role} drawer keeps keyboard focus inside and Escape returns it`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: buttonName }).click();
    const trigger = page.getByRole("button", { name: "메뉴 열기" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const close = page.getByRole("button", { name: "메뉴 닫기" });
    await expect(close).toBeFocused({ timeout: 1500 });
    await expect(page.getByRole("dialog", { name: "주 메뉴" })).toBeVisible();
    await expect(page.locator(".main-area")).toHaveAttribute("inert", "");
    await page.keyboard.press("Shift+Tab");
    await expect(
      page.getByRole("button", { name: "로그아웃", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.locator(".main-area").evaluate((el) => {
      el.querySelector("button, input, textarea")?.focus();
    });
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".scrim")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
    await expect(page.locator(".main-area")).not.toHaveAttribute("inert");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });
}

test("drawer close button and scrim both return focus to the menu button", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "직원으로 체험하기" }).click();
  const trigger = page.getByRole("button", { name: "메뉴 열기" });
  await trigger.click();
  await page.getByRole("button", { name: "메뉴 닫기" }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.locator(".scrim").click({ position: { x: 375, y: 100 } });
  await expect(trigger).toBeFocused();
  await expect(page.locator(".main-area")).not.toHaveAttribute("inert");
});

test("drawer navigation closes the menu and restores a usable focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "직원으로 체험하기" }).click();
  const trigger = page.getByRole("button", { name: "메뉴 열기" });
  await trigger.click();
  await page.getByRole("link", { name: "내 계정", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "내 계정", exact: true }),
  ).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(page.locator(".scrim")).toHaveCount(0);
  await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
});

test("drawer releases modal state at the desktop breakpoint and stays closed on return", async ({
  page,
}) => {
  await page.setViewportSize({ width: 839, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "직원으로 체험하기" }).click();
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await expect(page.getByRole("button", { name: "메뉴 닫기" })).toBeFocused();
  await page.setViewportSize({ width: 840, height: 844 });
  await expect(page.locator(".scrim")).toHaveCount(0);
  await expect(page.locator(".main-area")).not.toHaveAttribute("inert");
  await expect(page.locator(".sidebar")).not.toHaveAttribute("inert");
  await expect(page.getByRole("dialog", { name: "주 메뉴" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "새 요청", exact: true }),
  ).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "메뉴 열기" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.locator(".sidebar")).toHaveAttribute("inert", "");
});

test("logging out from the drawer clears modal state for the next login", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "관리자로 체험하기" }).click();
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "직원으로 체험하기" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  await page.getByRole("button", { name: "직원으로 체험하기" }).click();
  await expect(page.locator(".main-area")).not.toHaveAttribute("inert");
  await page.getByRole("button", { name: "메뉴 열기" }).click();
  await expect(page.getByRole("button", { name: "메뉴 닫기" })).toBeFocused();
});
