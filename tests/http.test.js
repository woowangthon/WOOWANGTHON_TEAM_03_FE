import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiError,
  createHttpClient,
  describeApiError,
} from "../src/api/http.js";
import { createAuthApi } from "../src/api/auth.js";

const session = {
  user: {
    id: "u",
    username: "USER0001",
    full_name: "시험 사용자",
    role: "user",
  },
  session_expires_at: new Date(Date.now() + 3600000).toISOString(),
};

test("login rotates CSRF; later PATCH uses new token; 204 has no body", async () => {
  const calls = [];
  const replies = [
    new Response(JSON.stringify({ csrf_token: "before" })),
    new Response(JSON.stringify({ ...session, csrf_token: "after" })),
    new Response(JSON.stringify({ user: { full_name: "새 이름" } })),
    new Response(null, { status: 204 }),
  ];
  const client = createHttpClient({
    fetchImpl: async (...args) => {
      calls.push(args);
      return replies.shift();
    },
  });
  const auth = createAuthApi(client);
  await auth.login("USER0001", "input");
  await auth.changeName("새 이름");
  await auth.logout();
  assert.equal(calls[1][1].headers["X-CSRFToken"], "before");
  assert.equal(calls[2][1].headers["X-CSRFToken"], "after");
  assert.equal(calls[2][1].credentials, "include");
  assert.equal(calls[2][1].method, "PATCH");
  assert.equal(calls.length, 4);
});
test("403 forbidden remains distinct from authentication expiration", async () => {
  const client = createHttpClient({
    fetchImpl: async () =>
      new Response(
        JSON.stringify({ error: { code: "FORBIDDEN", message: "권한 없음" } }),
        { status: 403 },
      ),
  });
  await assert.rejects(
    client.request("/admin/users/"),
    (e) => e.code === "FORBIDDEN" && e.status === 403,
  );
});
test("network failure never retries a mutation or substitutes mock success", async () => {
  let calls = 0;
  const client = createHttpClient({
    fetchImpl: async () => {
      calls++;
      throw new TypeError("network");
    },
  });
  client.setCsrf("known");
  await assert.rejects(
    client.request("/auth/name/", {
      method: "PATCH",
      body: { full_name: "name" },
    }),
    (e) => e.code === "NETWORK_ERROR",
  );
  assert.equal(calls, 1);
});
test("HTML proxy errors become readable response errors", async () => {
  const client = createHttpClient({
    fetchImpl: async () =>
      new Response("<h1>bad gateway</h1>", { status: 502 }),
  });
  await assert.rejects(
    client.request("/auth/me/"),
    (e) => e.code === "INVALID_RESPONSE" && e.status === 502,
  );
});

test("CSRF rejection refreshes the token only on the next explicit attempt", async () => {
  const calls = [];
  const replies = [
    new Response(
      JSON.stringify({
        error: { code: "CSRF_FAILED", message: "보안 토큰 오류" },
      }),
      { status: 403 },
    ),
    new Response(JSON.stringify({ csrf_token: "fresh" })),
    new Response(
      JSON.stringify({ user: { ...session.user, full_name: "이름" } }),
    ),
  ];
  const client = createHttpClient({
    fetchImpl: async (...args) => {
      calls.push(args);
      return replies.shift();
    },
  });
  client.setCsrf("stale");
  const change = () =>
    client.request("/auth/name/", {
      method: "PATCH",
      body: { full_name: "이름" },
    });
  await assert.rejects(change(), (error) => error.code === "CSRF_FAILED");
  assert.equal(calls.length, 1);
  await change();
  assert.equal(calls[1][0], "/api/v1/auth/csrf/");
  assert.equal(calls[2][1].headers["X-CSRFToken"], "fresh");
});

test("field validation reasons remain visible without exposing response objects", () => {
  const error = new ApiError("INVALID_INPUT", "입력을 확인해 주세요.", 400, {
    new_password: ["너무 흔한 비밀번호입니다."],
  });
  assert.equal(
    describeApiError(error),
    "입력을 확인해 주세요.\n새 비밀번호: 너무 흔한 비밀번호입니다.",
  );
});

test("a CSRF response received after logout cannot authorize an earlier mutation", async () => {
  const calls = [];
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const client = createHttpClient({
    fetchImpl: async (path, options) => {
      calls.push({ path, options });
      if (calls.length === 1) return pending;
      return new Response(JSON.stringify({ user: session.user }));
    },
  });
  const oldChange = client.request("/auth/name/", {
    method: "PATCH",
    body: { full_name: "옛 요청" },
  });
  const rejected = assert.rejects(
    oldChange,
    (error) => error.code === "SESSION_CHANGED",
  );
  client.clear();
  client.setCsrf("new-session");
  release(new Response(JSON.stringify({ csrf_token: "old-session" })));
  await rejected;
  assert.equal(calls.length, 1);
  await client.request("/auth/name/", {
    method: "PATCH",
    body: { full_name: "새 요청" },
  });
  assert.equal(calls[1].options.headers["X-CSRFToken"], "new-session");
});

test("login rejects incomplete sessions and unsupported roles", async () => {
  const invalidSessions = [
    { ...session, user: { ...session.user, role: "superuser" } },
    { ...session, session_expires_at: null },
    { ...session, session_expires_at: "invalid" },
    { ...session, user: { ...session.user, id: "" } },
  ];
  for (const invalid of invalidSessions) {
    const auth = createAuthApi(
      createHttpClient({
        fetchImpl: async () =>
          new Response(JSON.stringify({ ...invalid, csrf_token: "fixture" })),
      }),
    );
    await assert.rejects(
      auth.login("USER0001", "input"),
      (error) => error.code === "INVALID_RESPONSE",
    );
  }
});

test("a previous session's late logout success cannot clear the current CSRF token", async () => {
  const calls = [];
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const client = createHttpClient({
    fetchImpl: async (path, options) => {
      calls.push({ path, options });
      return calls.length === 1
        ? pending
        : new Response(JSON.stringify({ user: session.user }));
    },
  });
  const auth = createAuthApi(client);
  client.setCsrf("previous-session");
  const logout = auth.logout();
  const rejected = assert.rejects(
    logout,
    (error) => error.code === "SESSION_CHANGED",
  );
  client.clear();
  client.setCsrf("current-session");
  release(new Response(null, { status: 204 }));
  await rejected;
  await auth.changeName("새 이름");
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers["X-CSRFToken"], "current-session");
});
