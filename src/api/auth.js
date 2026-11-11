import { ApiError, createHttpClient } from "./http.js";

function validateSession(data) {
  const user = data?.user;
  if (
    !user ||
    !["id", "username", "full_name"].every(
      (key) => typeof user[key] === "string" && user[key].trim(),
    ) ||
    !["admin", "user"].includes(user.role) ||
    typeof data.session_expires_at !== "string" ||
    !Number.isFinite(Date.parse(data.session_expires_at))
  ) {
    throw new ApiError(
      "INVALID_RESPONSE",
      "로그인 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
    );
  }
  if (Date.parse(data.session_expires_at) <= Date.now()) {
    throw new ApiError(
      "AUTH_REQUIRED",
      "로그인이 만료됐습니다. 다시 로그인해 주세요.",
    );
  }
  return data;
}

/** The 11 authentication/account operations in the 2026-11-10 API contract. */
export function createAuthApi(client = createHttpClient()) {
  return {
    async bootstrap() {
      const current = validateSession(await client.request("/auth/me/"));
      await client.prepareCsrf();
      return current;
    },
    async login(username, password) {
      const data = validateSession(
        await client.request("/auth/login/", {
          method: "POST",
          body: { username, password },
        }),
      );
      if (typeof data.csrf_token !== "string" || !data.csrf_token) {
        client.clear();
        throw new ApiError(
          "INVALID_RESPONSE",
          "로그인 보호 정보를 확인하지 못했습니다. 다시 로그인해 주세요.",
        );
      }
      client.setCsrf(data.csrf_token);
      return data;
    },
    async logout() {
      await client.request("/auth/logout/", { method: "POST", body: {} });
      client.clear();
    },
    async changePassword(current_password, new_password) {
      await client.request("/auth/password/change/", {
        method: "POST",
        body: { current_password, new_password },
      });
      client.clear();
    },
    changeName: (full_name) =>
      client.request("/auth/name/", { method: "PATCH", body: { full_name } }),
    createUser: (body) =>
      client.request("/admin/users/", { method: "POST", body }),
    listUsers: ({ q = "", status = "active", page = 1, page_size = 20 } = {}) =>
      client.request(
        "/admin/users/?" + new URLSearchParams({ q, status, page, page_size }),
      ),
    changeUserName: (id, full_name) =>
      client.request(`/admin/users/${encodeURIComponent(id)}/name/`, {
        method: "PATCH",
        body: { full_name },
      }),
    resetPassword: (id, new_password) =>
      client.request(`/admin/users/${encodeURIComponent(id)}/password/reset/`, {
        method: "POST",
        body: { new_password },
      }),
    deactivate: (id) =>
      client.request(`/admin/users/${encodeURIComponent(id)}/deactivate/`, {
        method: "POST",
      }),
    clear: () => client.clear(),
  };
}
