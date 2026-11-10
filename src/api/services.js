import { createAuthApi } from "./auth.js";
import { createHttpClient } from "./http.js";
import { createMockRequests } from "./mockRequests.js";
import { createRequestApi } from "./requests.js";
import { createAdminApi } from "./admin.js";

export const authMode = import.meta.env.VITE_AUTH_MODE || "mock";
export const requestMode = import.meta.env.VITE_REQUEST_MODE || "mock";
if (![authMode, requestMode].every((mode) => ["mock", "real"].includes(mode)))
  throw new Error("연결 모드는 mock 또는 real이어야 합니다.");
if (requestMode === "real" && authMode !== "real")
  throw new Error("실제 의뢰 접수에는 실제 인증 연결이 필요합니다.");
const client = createHttpClient();
export const authApi = createAuthApi(client);
export const adminApi = createAdminApi(client);
const mockRequests = createMockRequests();
export const requestApi =
  requestMode === "mock" ? mockRequests : createRequestApi(client);
export function clearRequestData() {
  mockRequests.clear();
}
