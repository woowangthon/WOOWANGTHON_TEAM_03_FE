import { test, expect } from "@playwright/test";

test("service branding and employee navigation expose one request entry and the account menu", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".brand")).toContainText("마스킹 어시스턴트");
  await expect(
    page.getByText("검사 → 전송 확인 → 답변", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "직원으로 체험하기" }).click();
  await expect(page.locator(".brand")).toContainText("마스킹 어시스턴트");
  await expect(
    page.getByRole("button", { name: "새 요청", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "AI 작업 공간", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "내 계정", exact: true }),
  ).toHaveCount(0);
  for (const text of [
    "나의 안전한 AI 작업 공간",
    "서버 인증 · 의뢰 접수 연결",
    "전송 전, 한 번 더 확인",
    "내가 승인한 내용으로 일하세요.",
  ])
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "계정 메뉴", exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: /계정\s*설정/ }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByRole("textbox", { name: "이름", exact: true }),
  ).toBeVisible();
  await expect(menu).toBeHidden();
});

test("account menu Escape returns focus and its name button opens the same account screen", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "관리자로 체험하기" }).click();
  for (const text of [
    "보안 관리",
    "서버 인증 · 실제 이용 현황",
    "계정 관리와 요청 감사·통계가 실제 서버에 연결되어 있습니다.",
    "관리와 AI 이용을 구분해요",
    "AI 이용은 본인의 일반 계정으로 로그인하세요.",
  ])
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "계정 메뉴", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "내 계정 설정", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByRole("textbox", { name: "이름", exact: true }),
  ).toBeVisible();
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1024, height: 640 },
]) {
  test(`employee composer and navigation fit ${viewport.width}px without a global horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: "직원으로 체험하기" }).click();
    const input = page.getByRole("textbox", { name: "요청 내용", exact: true });
    await expect(input).toBeVisible();
    await input.fill("반응형 입력창 확인\n둘째 줄의 한글 요청문");
    const box = await input.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (viewport.width < 840) {
      await page
        .getByRole("button", { name: "메뉴 열기", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "계정 메뉴", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "로그아웃", exact: true }),
      ).toBeVisible();
    }
  });
}
