export class ApiError extends Error {
  constructor(code, message, status = 0, fields = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

/** A session client; CSRF stays in memory and mutations are never retried. */
export function createHttpClient({
  baseUrl = "/api/v1",
  fetchImpl = globalThis.fetch,
} = {}) {
  let csrfToken = null;
  let csrfPending = null;

  async function request(path, { method = "GET", body, signal } = {}) {
    const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (mutation && !csrfToken) await prepareCsrf();
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (mutation) headers["X-CSRFToken"] = csrfToken;
    let response;
    try {
      response = await fetchImpl(baseUrl + path, {
        method,
        credentials: "include",
        headers,
        signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (error.name === "AbortError") throw error;
      throw new ApiError(
        "NETWORK_ERROR",
        mutation
          ? "서버 응답을 확인하지 못했습니다. 변경이 반영됐을 수 있으니 상태를 확인해 주세요."
          : "서버에 연결하지 못했습니다. 잠시 후 다시 조회해 주세요.",
      );
    }
    if (response.ok && response.status === 204) return null;
    let data;
    try {
      data = JSON.parse(await response.text());
    } catch {
      throw new ApiError(
        "INVALID_RESPONSE",
        "서버 응답을 읽지 못했습니다. 연결 설정을 확인해 주세요.",
        response.status,
      );
    }
    if (!response.ok) {
      // A second tab may rotate the cookie. Only prepare a new token for the
      // user's next attempt; never automatically repeat a mutation.
      if (data?.error?.code === "CSRF_FAILED") csrfToken = null;
      throw new ApiError(
        data?.error?.code || "REQUEST_FAILED",
        data?.error?.message || "요청을 처리하지 못했습니다.",
        response.status,
        data?.error?.fields || {},
      );
    }
    return data;
  }

  async function prepareCsrf() {
    if (!csrfPending)
      csrfPending = request("/auth/csrf/")
        .then((data) => {
          if (!data?.csrf_token)
            throw new ApiError(
              "INVALID_RESPONSE",
              "인증 준비 정보를 받지 못했습니다.",
            );
          csrfToken = data.csrf_token;
        })
        .finally(() => {
          csrfPending = null;
        });
    await csrfPending;
  }

  return {
    request,
    prepareCsrf,
    setCsrf: (token) => {
      csrfToken = token || null;
    },
    clear: () => {
      csrfToken = null;
    },
  };
}

export function describeApiError(error) {
  const labels = {
    username: "로그인 ID",
    full_name: "이름",
    password: "비밀번호",
    current_password: "현재 비밀번호",
    new_password: "새 비밀번호",
    non_field_errors: "입력 내용",
  };
  const details = Object.entries(error.fields || {}).flatMap(
    ([field, errors]) =>
      (Array.isArray(errors) ? errors : [errors])
        .filter((value) => typeof value === "string")
        .map((value) => `${labels[field] || field}: ${value}`),
  );
  return [error.message || "요청을 처리하지 못했습니다.", ...details].join(
    "\n",
  );
}
