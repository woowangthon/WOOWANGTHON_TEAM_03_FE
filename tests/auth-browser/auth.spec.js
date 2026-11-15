import { test, expect } from "@playwright/test";
import { selectOption, openAccount, logout } from "../helpers/ui.js";
import {
  admin,
  employee,
  fakePassword,
  installAuthFixture,
  login,
} from "./auth-fixture.js";

test("login explains invalid ID and overlong password before sending credentials", async ({
  page,
}) => {
  const state = await installAuthFixture(page);
  await page.goto("/");
  await login(page, "sophi");
  expect(
    await page
      .getByRole("textbox", { name: "로그인 ID", exact: true })
      .evaluate((input) => input.validity.patternMismatch),
  ).toBe(true);
  await expect(
    page.getByText("로그인 ID는 대문자 영문 또는 숫자로 된 8자리입니다."),
  ).toBeVisible();
  expect(state.calls).not.toContain("POST /auth/login/");
  await login(page, admin.username, "A".repeat(31));
  await expect(page.getByRole("alert")).toContainText("비밀번호는 30자 이내");
  expect(state.calls).not.toContain("POST /auth/login/");
});

test("real client logs in, restores its session and logs out without exposing employee tools to an admin", async ({
  page,
}) => {
  const state = await installAuthFixture(page);
  await page.goto("/?request=other-users-request");
  await login(page);
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "보안 현황" })).toBeVisible();
  await expect(page.getByRole("link", { name: "AI 작업 공간" })).toHaveCount(0);
  await expect(page.locator("textarea, .history-list")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "보안 현황" })).toBeVisible();
  await openAccount(page);
  await expect(
    page.getByRole("textbox", { name: "이름", exact: true }),
  ).toHaveValue(admin.full_name);
  expect(
    await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
  await logout(page);
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeVisible();
  expect(state.calls).toEqual(
    expect.arrayContaining([
      "GET /auth/csrf/",
      "POST /auth/login/",
      "GET /auth/me/",
      "POST /auth/logout/",
    ]),
  );
  expect(state.unexpected).toEqual([]);
});

test("user search preserves Korean composition, caret edits and the applied query", async ({
  page,
}) => {
  await installAuthFixture(page, { signedIn: admin });
  await page.goto("/admin/users?status=all");
  const search = page.getByRole("textbox", { name: "사용자 검색" });
  const dots = page.locator("td .status-dot");
  await expect(dots).toHaveCount(2);
  const colors = await dots.evaluateAll((nodes) =>
    nodes.map((node) => getComputedStyle(node).backgroundColor),
  );
  expect(colors[0]).not.toBe(colors[1]);
  await search.focus();
  const ime = await page.context().newCDPSession(page);
  for (const text of ["ㅅ", "시", "시험"]) {
    await ime.send("Input.imeSetComposition", {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
    await expect(search).toHaveValue(text);
    expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  }
  await ime.send("Input.insertText", { text: "시험" });
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("시험");
  await expect(
    page.getByRole("cell", { name: employee.username }),
  ).toBeVisible();
  await search.press("Home");
  await search.pressSequentially("Ab12");
  await expect(search).toHaveValue("Ab12시험");
  await search.press("Backspace");
  await expect(search).toHaveValue("Ab1시험");
  await expect(search).toBeFocused();
  await search.fill("");
  await expect(dots).toHaveCount(2);
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
});

test("admin account operations use the contract and disabled users cannot be edited", async ({
  page,
}) => {
  const state = await installAuthFixture(page, { signedIn: admin });
  await page.goto("/admin");
  await page.getByRole("link", { name: "사용자 관리", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: employee.username }),
  ).toBeVisible();
  await selectOption(page, "계정 상태", "비활성 계정");
  const inactive = page.getByRole("row").filter({ hasText: "USER0002" });
  await inactive
    .getByRole("button", { name: "비활성 직원 계정 상세 보기", exact: true })
    .click();
  const profile = page.getByRole("region", {
    name: "사용자 정보",
    exact: true,
  });
  await expect(profile).toContainText("USER0002");
  await expect(profile).toContainText("33333333-3333-4333-8333-333333333333");
  await expect(
    profile.getByRole("button", { name: "비밀번호 재설정", exact: true }),
  ).toBeDisabled();
  await expect(
    profile.getByRole("button", { name: "이름 변경", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "뒤로가기", exact: true }).click();
  await selectOption(page, "계정 상태", "활성 계정");
  await page.getByRole("button", { name: "＋ 계정 발급" }).click();
  const panel = page.locator(".action-panel");
  await panel.getByLabel("로그인 ID", { exact: true }).fill("USER0003");
  await panel.getByLabel("이름", { exact: true }).fill("신규 직원");
  await panel.getByLabel("초기 비밀번호", { exact: true }).fill(fakePassword);
  await panel.getByRole("button", { name: "일반 계정 발급" }).click();
  await expect(page.getByRole("cell", { name: "USER0003" })).toBeVisible();
  await page.getByPlaceholder("ID 또는 이름 검색").fill("USER0003");
  const row = page.getByRole("row").filter({ hasText: "USER0003" });
  await expect(page.getByRole("cell", { name: employee.username })).toHaveCount(
    0,
  );
  await row
    .getByRole("button", { name: "신규 직원 계정 상세 보기", exact: true })
    .click();
  await expect(profile).toContainText("USER0003");
  await expect(profile).toContainText("44444444-4444-4444-8444-444444444444");
  await profile.getByRole("button", { name: "이름 변경", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users\/[^/]+\/name(?:\?|$)/);
  await expect(
    page.getByRole("button", { name: "뒤로가기", exact: true }),
  ).toBeVisible();
  await panel.getByLabel("이름", { exact: true }).fill("변경 직원");
  await panel.getByRole("button", { name: "이름 변경" }).click();
  await expect(page).toHaveURL(
    /\/admin\/users\/44444444-4444-4444-8444-444444444444(?:\?|$)/,
  );
  await expect(profile).toContainText("변경 직원");
  await profile
    .getByRole("button", { name: "비밀번호 재설정", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/users\/[^/]+\/password(?:\?|$)/);
  await expect(
    page.getByRole("button", { name: "뒤로가기", exact: true }),
  ).toBeVisible();
  await panel
    .getByLabel("새 비밀번호", { exact: true })
    .fill("ChangedFixture9!");
  await panel.getByRole("button", { name: "비밀번호 재설정" }).click();
  await expect(panel).toHaveCount(0);
  await expect(profile).toContainText("변경 직원");
  await profile.getByRole("button", { name: "비활성화", exact: true }).click();
  await expect(panel).toContainText("재활성화는 지원하지 않습니다");
  await panel
    .getByRole("button", { name: "계정 비활성화", exact: true })
    .click();
  await expect(
    profile.getByRole("button", { name: "이름 변경", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "뒤로가기", exact: true }).click();
  await expect(row).toHaveCount(0);
  await selectOption(page, "계정 상태", "비활성 계정");
  await row
    .getByRole("button", { name: "변경 직원 계정 상세 보기", exact: true })
    .click();
  await expect(
    profile.getByRole("button", { name: "이름 변경", exact: true }),
  ).toBeDisabled();
  const id = "44444444-4444-4444-8444-444444444444";
  expect(state.calls).toEqual(
    expect.arrayContaining([
      "GET /admin/users/",
      "POST /admin/users/",
      `PATCH /admin/users/${id}/name/`,
      `POST /admin/users/${id}/password/reset/`,
      `POST /admin/users/${id}/deactivate/`,
    ]),
  );
  expect(state.unexpected).toEqual([]);
});

test("employee name change keeps the session and password change ends it", async ({
  page,
}) => {
  const state = await installAuthFixture(page, { signedIn: employee });
  await page.goto("/account");
  await page
    .getByRole("textbox", { name: "이름", exact: true })
    .fill("변경한 이름");
  await page.getByRole("button", { name: "이름 저장" }).click();
  await expect(
    page.getByText("이름을 변경했습니다.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "이름", exact: true }),
  ).toHaveValue("변경한 이름");
  await page.getByLabel("현재 비밀번호", { exact: true }).fill(fakePassword);
  await page
    .getByLabel("새 비밀번호", { exact: true })
    .fill("ChangedFixture9!");
  await page
    .getByLabel("새 비밀번호 확인", { exact: true })
    .fill("ChangedFixture9!");
  await page.getByRole("button", { name: "비밀번호 변경 후 로그아웃" }).click();
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeVisible();
  expect(state.calls).toContain("PATCH /auth/name/");
  expect(state.calls).toContain("POST /auth/password/change/");
  expect(state.current).toBeNull();
  expect(state.unexpected).toEqual([]);
});

for (const invalid of ["unknown-role", "missing-expiry", "expired"]) {
  test(`invalid session (${invalid}) never reveals a protected screen`, async ({
    page,
  }) => {
    const state = await installAuthFixture(page, { signedIn: admin });
    state.sessionOverride = {
      user: { ...admin },
      session_expires_at: state.expires,
    };
    if (invalid === "unknown-role")
      state.sessionOverride.user.role = "superuser";
    if (invalid === "missing-expiry")
      delete state.sessionOverride.session_expires_at;
    if (invalid === "expired")
      state.sessionOverride.session_expires_at = "2020-01-01T00:00:00Z";
    await page.goto("/admin");
    await expect(
      page.getByRole("button", { name: "로그인", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "보안 현황" })).toHaveCount(
      0,
    );
    expect(state.calls.some((call) => call.includes("/admin/"))).toBe(false);
  });
}

test("CSRF failure needs a manual retry; permission failure keeps the session; authentication failure clears it", async ({
  page,
}) => {
  const state = await installAuthFixture(page, { signedIn: employee });
  await page.goto("/account");
  await expect(page.getByRole("button", { name: "이름 저장" })).toBeVisible();
  state.failNext = {
    operation: "PATCH /auth/name/",
    status: 403,
    code: "CSRF_FAILED",
    message: "보안 토큰을 다시 확인해 주세요.",
  };
  await page.getByRole("button", { name: "이름 저장" }).click();
  await expect(page.getByRole("alert")).toContainText("보안 토큰을 다시 확인");
  expect(state.calls.filter((op) => op === "PATCH /auth/name/")).toHaveLength(
    1,
  );
  const before = state.calls.filter((op) => op === "GET /auth/csrf/").length;
  await page.getByRole("button", { name: "이름 저장" }).click();
  await expect(
    page.getByText("이름을 변경했습니다.", { exact: true }),
  ).toBeVisible();
  expect(state.calls.filter((op) => op === "GET /auth/csrf/")).toHaveLength(
    before + 1,
  );
  state.failNext = {
    operation: "PATCH /auth/name/",
    status: 403,
    code: "FORBIDDEN",
    message: "변경 권한이 없습니다.",
  };
  await page.getByRole("button", { name: "이름 저장" }).click();
  await expect(page.getByRole("alert")).toContainText("변경 권한이 없습니다");
  await expect(page.getByRole("heading", { name: "내 계정" })).toBeVisible();
  state.failNext = {
    operation: "PATCH /auth/name/",
    status: 403,
    code: "AUTH_REQUIRED",
  };
  await page.getByRole("button", { name: "이름 저장" }).click();
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeVisible();
  expect(state.unexpected).toEqual([]);
});

test("a delayed authentication error from a previous session cannot log out the new account", async ({
  page,
}) => {
  const state = await installAuthFixture(page, { signedIn: employee });
  await page.goto("/account");
  await expect(page.getByRole("button", { name: "이름 저장" })).toBeVisible();
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  state.failNext = {
    operation: "PATCH /auth/name/",
    status: 403,
    code: "AUTH_REQUIRED",
    wait,
  };
  await page.getByRole("button", { name: "이름 저장" }).click();
  await expect.poll(() => state.calls.includes("PATCH /auth/name/")).toBe(true);
  await logout(page);
  await login(page);
  await expect(page.getByRole("heading", { name: "보안 현황" })).toBeVisible();
  const finished = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/name/") && response.status() === 403,
  );
  release();
  await finished;
  await openAccount(page);
  await expect(
    page.getByRole("textbox", { name: "이름", exact: true }),
  ).toHaveValue(admin.full_name);
});

test("an uncertain network result is shown without repeating an account mutation", async ({
  page,
}) => {
  const state = await installAuthFixture(page, { signedIn: employee });
  await page.goto("/account");
  await expect(page.getByRole("button", { name: "이름 저장" })).toBeVisible();
  state.failNext = { operation: "PATCH /auth/name/", abort: true };
  await page.getByRole("button", { name: "이름 저장" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "변경이 반영됐을 수 있으니",
  );
  expect(state.calls.filter((op) => op === "PATCH /auth/name/")).toHaveLength(
    1,
  );
  await expect(page.getByRole("heading", { name: "내 계정" })).toBeVisible();
});

test("missing current password focuses its field and does not send a password mutation", async ({
  page,
}) => {
  const state = await installAuthFixture(page, { signedIn: employee });
  await page.goto("/account");
  const panel = page.locator(".password-panel");
  await panel
    .getByLabel("새 비밀번호", { exact: true })
    .fill("ChangedFixture9!");
  await panel
    .getByLabel("새 비밀번호 확인", { exact: true })
    .fill("ChangedFixture9!");
  await panel
    .getByRole("button", { name: "비밀번호 변경 후 로그아웃", exact: true })
    .click();
  const current = panel.getByLabel("현재 비밀번호", { exact: true });
  await expect(current).toBeFocused();
  expect(await current.evaluate((input) => input.validity.valueMissing)).toBe(
    true,
  );
  expect(state.calls).not.toContain("POST /auth/password/change/");
  expect(state.current?.id).toBe(employee.id);
});

test("password mismatch and server rejection stay in the password panel and remain visible on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  const state = await installAuthFixture(page, { signedIn: employee });
  await page.goto("/account");
  const panel = page.locator(".password-panel");
  await panel.getByLabel("현재 비밀번호", { exact: true }).fill(fakePassword);
  await panel
    .getByLabel("새 비밀번호", { exact: true })
    .fill("ChangedFixture9!");
  await panel
    .getByLabel("새 비밀번호 확인", { exact: true })
    .fill("DifferentFixture9!");
  await panel
    .getByRole("button", { name: "비밀번호 변경 후 로그아웃", exact: true })
    .click();
  const alert = panel.getByRole("alert");
  await expect(alert).toContainText("새 비밀번호 확인 값이 일치하지 않습니다.");
  await expect(alert).toBeInViewport({ ratio: 1 });
  expect(state.calls).not.toContain("POST /auth/password/change/");
  await panel
    .getByLabel("새 비밀번호 확인", { exact: true })
    .fill("ChangedFixture9!");
  await panel
    .getByLabel("현재 비밀번호", { exact: true })
    .fill("WrongFixture9!");
  await panel
    .getByRole("button", { name: "비밀번호 변경 후 로그아웃", exact: true })
    .click();
  await expect(alert).toContainText("현재 비밀번호가 올바르지 않습니다.");
  await expect(alert).toBeInViewport({ ratio: 1 });
  const confirmBox = await panel
    .getByLabel("새 비밀번호 확인", { exact: true })
    .boundingBox();
  const alertBox = await alert.boundingBox();
  const submitBox = await panel
    .getByRole("button", { name: "비밀번호 변경 후 로그아웃", exact: true })
    .boundingBox();
  expect(alertBox.y).toBeGreaterThanOrEqual(confirmBox.y + confirmBox.height);
  expect(alertBox.y + alertBox.height).toBeLessThanOrEqual(submitBox.y);
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(panel.getByLabel("새 비밀번호", { exact: true })).toHaveValue(
    "ChangedFixture9!",
  );
  expect(
    state.calls.filter((call) => call === "POST /auth/password/change/"),
  ).toHaveLength(1);
  expect(state.current?.id).toBe(employee.id);
  expect(state.unexpected).toEqual([]);
});
