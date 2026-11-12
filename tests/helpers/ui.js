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
