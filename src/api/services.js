import { createAuthApi } from "./auth.js";
import { ApiError } from "./http.js";
import { createMockRequests } from "./mockRequests.js";

export const authMode = import.meta.env.VITE_AUTH_MODE || "mock";
export const requestMode = import.meta.env.VITE_REQUEST_MODE || "mock";
if (![authMode, requestMode].every((mode) => ["mock", "real"].includes(mode)))
  throw new Error("연결 모드는 mock 또는 real이어야 합니다.");
export const authApi = createAuthApi();
const mockRequests = createMockRequests();
const pending = async () => {
  throw new ApiError(
    "API_NOT_READY",
    "요청 처리 API의 주소와 규격이 아직 확정되지 않았습니다. 실제 연결을 준비 중입니다.",
  );
};
export const requestApi =
  requestMode === "mock"
    ? mockRequests
    : {
        create: pending,
        get: pending,
        list: pending,
        approve: pending,
        clear() {},
      };
export function clearRequestData() {
  mockRequests.clear();
}
