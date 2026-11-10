import { ApiError, createHttpClient } from "./http.js";

export const MAX_PDF_BYTES = 10_000_000;
export const requestStateLabels = {
  preparing: "접수 완료 · 준비 중",
  queued: "처리 대기",
  analyzing: "검사 중",
  awaiting_approval: "전송 확인 대기",
  processing: "처리 중",
  completed: "완료",
  blocked: "정책 차단",
  rejected: "전송 거절",
  expired: "승인 만료",
  failed: "처리 실패",
};
export function requestStateLabel(state) {
  return requestStateLabels[state] || "상태 확인 필요";
}
export function validateIntake(instruction, file) {
  if (instruction && !instruction.trim())
    return "요청문에 공백만 입력할 수 없습니다. PDF만 접수하려면 요청문을 비워 주세요.";
  if (!instruction.trim() && !file)
    return "요청문을 입력하거나 PDF 1개를 첨부해 주세요.";
  if ([...instruction].length > 4000)
    return "요청문은 4,000자 이내로 입력해 주세요.";
  if (file && !file.name.toLowerCase().endsWith(".pdf"))
    return "PDF 파일 1개만 선택해 주세요.";
  if (file?.size === 0) return "빈 파일은 첨부할 수 없습니다.";
  if (file?.size > MAX_PDF_BYTES)
    return "10MB(10,000,000바이트) 이하의 PDF를 선택해 주세요.";
  return null;
}
function employeeOnly(user) {
  if (user?.role !== "user")
    throw new ApiError("FORBIDDEN", "일반 계정으로 이용해 주세요.", 403);
}
function idPath(id) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new ApiError("REQUEST_NOT_FOUND", "요청을 찾을 수 없습니다.", 404);
  }
  return `/requests/${id}/`;
}
function detail(data) {
  const value = data?.request;
  if (
    !value ||
    typeof value.request_id !== "string" ||
    typeof value.instruction !== "string" ||
    typeof value.state !== "string" ||
    typeof value.processing_available !== "boolean"
  ) {
    throw new ApiError(
      "INVALID_RESPONSE",
      "접수 응답을 확인하지 못했습니다. 같은 접수 번호로 결과를 다시 확인해 주세요.",
    );
  }
  return { ...value, id: value.request_id, replayed: data.replayed === true };
}

/** Intake only: no AI start, approval, route change or automatic mutation retry. */
export function createRequestApi(client = createHttpClient()) {
  return {
    async create(user, { key, instruction, file }) {
      employeeOnly(user);
      let body = { client_request_key: key, instruction };
      if (file) {
        body = new FormData();
        body.set("client_request_key", key);
        body.set("instruction", instruction);
        body.set("pdf", file, file.name);
      }
      return detail(
        await client.request("/requests/", { method: "POST", body }),
      );
    },
    async get(user, id, { signal } = {}) {
      employeeOnly(user);
      return detail(await client.request(idPath(id), { signal }));
    },
    async updateInstruction(user, id, instruction) {
      employeeOnly(user);
      return detail(
        await client.request(idPath(id), {
          method: "PATCH",
          body: { instruction },
        }),
      );
    },
    async listPage(user, { page = 1, page_size = 20, signal } = {}) {
      employeeOnly(user);
      const data = await client.request(
        "/requests/?" + new URLSearchParams({ page, page_size }),
        { signal },
      );
      if (
        !Array.isArray(data?.results) ||
        !Number.isInteger(data.page) ||
        !Number.isInteger(data.count)
      )
        throw new ApiError("INVALID_RESPONSE", "요청 목록을 읽지 못했습니다.");
      return {
        ...data,
        results: data.results.map((row) => ({
          ...row,
          id: row.request_id,
          instruction:
            row.instruction_preview ||
            row.document?.original_filename ||
            "PDF 요청",
        })),
      };
    },
    async file(user, id) {
      if (!["user", "admin"].includes(user?.role))
        throw new ApiError("AUTH_REQUIRED", "로그인이 필요합니다.", 401);
      // Construct the same-origin endpoint; never trust a URL from document metadata.
      return client.request(idPath(id) + "file/", { responseType: "pdf" });
    },
  };
}
