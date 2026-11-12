import { test, expect } from "@playwright/test";
import { openAccount, openAccountPopup } from "../helpers/ui.js";

test("service branding and employee navigation expose one request entry and one profile trigger", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".brand")).toContainText("Mask Assistant");
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
  await expect(
    page.getByRole("button", { name: "내 계정 메뉴", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "계정 메뉴", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "로그아웃", exact: true }),
  ).toBeHidden();
  const popup = await openAccountPopup(page);
  await expect(popup).toContainText("직원 체험");
  await expect(popup).toContainText("DEMO0001");
  await expect(popup).toContainText("일반 사용자");
  await expect(page).toHaveURL(/\/$/);
  await openAccount(page);
  await expect(
    page.getByRole("textbox", { name: "이름", exact: true }),
  ).toHaveValue("직원 체험");
  await expect(popup).toBeHidden();
});

test("profile popup supports keyboard settings and logout navigation, Escape, and outside dismissal", async ({
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
  const trigger = page.getByRole("button", {
    name: "내 계정 메뉴",
    exact: true,
  });
  const popup = page.getByRole("dialog", { name: "계정 정보", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(popup).toBeVisible();
  await expect(popup).toContainText("보안팀 체험");
  await expect(popup).toContainText("DEMO0002");
  await expect(popup).toContainText("보안 관리자");
  await expect(
    popup.getByRole("button", { name: "계정 설정", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    popup.getByRole("button", { name: "로그아웃", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/admin$/);
  await trigger.click();
  await expect(popup).toBeVisible();
  await page.getByRole("heading", { name: "보안 현황", exact: true }).click();
  await expect(popup).toBeHidden();
  await openAccount(page);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1024, height: 640 },
]) {
  test(`employee composer and profile popup fit ${viewport.width}px without a global horizontal overflow`, async ({
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
    const popup = await openAccountPopup(page);
    const bounds = await popup.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    await expect(
      popup.getByRole("button", { name: "로그아웃", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(
      page.getByRole("button", { name: "내 계정 메뉴", exact: true }),
    ).toBeFocused();
    if (viewport.width < 840) {
      await expect(
        page.getByRole("dialog", { name: "주 메뉴", exact: true }),
      ).toBeVisible();
      await expect(page.locator(".main-area")).toHaveAttribute("inert", "");
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "주 메뉴", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "메뉴 열기", exact: true }),
      ).toBeFocused();
    }
    await expect(input).toHaveValue(
      "반응형 입력창 확인\n둘째 줄의 한글 요청문",
    );
  });
}
