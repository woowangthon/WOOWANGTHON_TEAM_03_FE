import { expect } from "@playwright/test";

// Exercise the same visible menu interaction a person uses; M3 Select is not
// a native <select>, and hidden form controls are not an interaction surface.
export async function selectOption(page, field, option) {
  const trigger = page.getByRole("combobox", { name: field, exact: true });
  await trigger.click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await list.getByRole("option", { name: option, exact: true }).click();
  await expect(trigger).toContainText(option);
  await expect(list).toBeHidden();
}

export async function openAccountPopup(page) {
  const trigger = page.getByRole("button", {
    name: "내 계정 메뉴",
    exact: true,
  });
  await expect(
    page.getByRole("button", {
      name: "내 계정 메뉴",
      exact: true,
      includeHidden: true,
    }),
  ).toBeAttached();
  if (!(await trigger.isVisible())) {
    const drawer = page.getByRole("button", { name: "메뉴 열기", exact: true });
    await expect(drawer).toBeVisible();
    if ((await drawer.getAttribute("aria-expanded")) === "false")
      await drawer.click();
  }
  await expect(trigger).toBeVisible();
  if ((await trigger.getAttribute("aria-expanded")) === "false")
    await trigger.click();
  const popup = page.getByRole("dialog", { name: "계정 정보", exact: true });
  await expect(popup).toBeVisible();
  return popup;
}

export async function openAccount(page) {
  const popup = await openAccountPopup(page);
  await popup.getByRole("button", { name: "계정 설정", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByRole("heading", { name: "내 계정", exact: true }),
  ).toBeVisible();
}

export async function logout(page) {
  const popup = await openAccountPopup(page);
  await popup.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(popup).toBeHidden();
}

export async function openFilters(page) {
  const trigger = page.getByRole("button", { name: "조회 조건", exact: true });
  await expect(trigger).toBeVisible();
  if ((await trigger.getAttribute("aria-expanded")) === "false")
    await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}
