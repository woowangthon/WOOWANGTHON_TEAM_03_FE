import { expect } from "@playwright/test";

export const fakePassword = "FixtureOnly9!";
export const admin = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "ADMIN001",
  full_name: "시험 관리자",
  role: "admin",
  is_active: true,
};
export const employee = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "USER0001",
  full_name: "시험 직원",
  role: "user",
  is_active: true,
};

export async function installAuthFixture(page, { signedIn = null } = {}) {
  const state = {
    current: signedIn ? { ...signedIn } : null,
    expires: new Date(Date.now() + 3600000).toISOString(),
    users: [
      { ...employee },
      {
        ...employee,
        id: "33333333-3333-4333-8333-333333333333",
        username: "USER0002",
        full_name: "비활성 직원",
        is_active: false,
      },
    ],
    password: fakePassword,
    csrf: "fixture-initial",
    sequence: 0,
    calls: [],
    unexpected: [],
    failNext: null,
    sessionOverride: null,
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace("/api/v1", "");
    const method = req.method();
    const operation = method + " " + path;
    state.calls.push(operation);
    const reply = (status, body) =>
      route.fulfill({
        status,
        ...(status === 204
          ? {}
          : { contentType: "application/json", body: JSON.stringify(body) }),
      });
    const fail = (status, code, message = code, fields) =>
      reply(status, {
        error: { code, message, ...(fields ? { fields } : {}) },
      });
    if (state.failNext?.operation === operation) {
      const failure = state.failNext;
      state.failNext = null;
      if (failure.wait) await failure.wait;
      if (failure.abort) return route.abort("failed");
      return fail(failure.status, failure.code, failure.message);
    }
    if (operation === "GET /auth/csrf/") {
      state.csrf = `fixture-${++state.sequence}`;
      return reply(200, { csrf_token: state.csrf });
    }
    if (method !== "GET") {
      expect(req.headers()["x-csrftoken"]).toBe(state.csrf);
      expect(req.headers()["content-type"] || "").not.toContain("multipart");
    }
    const body = req.postData() ? req.postDataJSON() : {};
    const session = () =>
      state.sessionOverride || {
        user: state.current,
        session_expires_at: state.expires,
      };
    if (operation === "POST /auth/login/") {
      expect(Object.keys(body).sort()).toEqual(["password", "username"]);
      const user =
        body.username === admin.username
          ? admin
          : state.users.find(
              (u) => u.username === body.username && u.is_active,
            );
      if (!user || body.password !== state.password)
        return fail(401, "INVALID_CREDENTIALS", "로그인 정보를 확인해 주세요.");
      state.current = { ...user };
      state.csrf = `fixture-login-${++state.sequence}`;
      return reply(200, { ...session(), csrf_token: state.csrf });
    }
    if (operation === "POST /auth/logout/") {
      expect(body).toEqual({});
      state.current = null;
      return reply(204);
    }
    if (!state.current)
      return fail(path === "/auth/me/" ? 401 : 403, "AUTH_REQUIRED");
    if (operation === "GET /auth/me/") return reply(200, session());
    if (operation === "PATCH /auth/name/") {
      expect(Object.keys(body)).toEqual(["full_name"]);
      if (!body.full_name.trim()) return fail(400, "INVALID_INPUT");
      state.current.full_name = body.full_name;
      return reply(200, { user: state.current });
    }
    if (operation === "POST /auth/password/change/") {
      expect(Object.keys(body).sort()).toEqual([
        "current_password",
        "new_password",
      ]);
      if (body.current_password !== state.password)
        return fail(
          400,
          "CURRENT_PASSWORD_INVALID",
          "현재 비밀번호가 올바르지 않습니다.",
        );
      state.password = body.new_password;
      state.current = null;
      return reply(204);
    }
    if (path.startsWith("/admin/") && state.current.role !== "admin")
      return fail(403, "FORBIDDEN");
    if (operation === "GET /admin/users/") {
      expect([...url.searchParams.keys()].sort()).toEqual([
        "page",
        "page_size",
        "q",
        "status",
      ]);
      const q = url.searchParams.get("q").toLowerCase();
      const status = url.searchParams.get("status");
      const rows = state.users.filter(
        (u) =>
          (status === "all" || u.is_active === (status === "active")) &&
          (u.username + u.full_name).toLowerCase().includes(q),
      );
      return reply(200, {
        count: rows.length,
        page: Number(url.searchParams.get("page")),
        page_size: 20,
        total_pages: 1,
        next_page: null,
        previous_page: null,
        results: rows,
      });
    }
    if (operation === "POST /admin/users/") {
      expect(Object.keys(body).sort()).toEqual([
        "full_name",
        "password",
        "username",
      ]);
      if (state.users.some((u) => u.username === body.username))
        return fail(409, "USERNAME_ALREADY_EXISTS", "이미 사용 중인 ID입니다.");
      const user = {
        ...employee,
        id: "44444444-4444-4444-8444-444444444444",
        username: body.username,
        full_name: body.full_name,
      };
      state.users.push(user);
      return reply(201, { user });
    }
    const target = path.match(
      /^\/admin\/users\/([^/]+)\/(name|password\/reset|deactivate)\/$/,
    );
    if (target) {
      const user = state.users.find((u) => u.id === target[1]);
      if (!user || (target[2] !== "deactivate" && !user.is_active))
        return fail(404, "USER_NOT_FOUND", "대상을 찾을 수 없습니다.");
      if (target[2] === "name" && method === "PATCH") {
        expect(Object.keys(body)).toEqual(["full_name"]);
        user.full_name = body.full_name;
        return reply(200, { user });
      }
      if (target[2] === "password/reset" && method === "POST") {
        expect(Object.keys(body)).toEqual(["new_password"]);
        return reply(204);
      }
      if (target[2] === "deactivate" && method === "POST") {
        expect(body).toEqual({});
        user.is_active = false;
        return reply(200, { user });
      }
    }
    // No request can escape the fixture and accidentally reach a real server.
    state.unexpected.push(operation);
    return fail(500, "UNEXPECTED_TEST_REQUEST");
  });
  return state;
}

export async function login(
  page,
  username = admin.username,
  password = fakePassword,
) {
  await page
    .getByRole("textbox", { name: "로그인 ID", exact: true })
    .fill(username);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
}
