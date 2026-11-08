import { createHttpClient } from "./http.js";

/** Contract: internal auth v1.0 + addendum v1.1. No business endpoints are assumed. */
export function createAuthApi(client = createHttpClient()) {
  return {
    async bootstrap() {
      const current = await client.request("/auth/me/");
      await client.prepareCsrf();
      return current;
    },
    async login(username, password) {
      const data = await client.request("/auth/login/", {
        method: "POST",
        body: { username, password },
      });
      client.setCsrf(data.csrf_token);
      return data;
    },
    async logout() {
      await client.request("/auth/logout/", { method: "POST" });
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
  };
}
