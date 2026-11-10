import { test, expect } from "@playwright/test";
import { installAuthFixture, employee, admin } from "./auth-fixture.js";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
async function setup(page, initial = "preparing") {
  const auth = await installAuthFixture(page, { signedIn: employee });
  const state = {
    starts: 0,
    reads: 0,
    patches: [],
    hold: null,
    loseStart: false,
    failStart: false,
    readError: null,
    row: {
      request_id: id,
      instruction: "가상 문서를 요약해 주세요.",
      state: initial,
      processing_available: initial === "preparing",
      document: null,
      answer_text: null,
    },
  };
  await page.route("**/api/v1/requests/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const fail = (code, status = 409) =>
      json({ error: { code, message: code } }, status);
    if (path === "/api/v1/requests/")
      return json({
        count: 1,
        page: 1,
        page_size: 20,
        total_pages: 1,
        next_page: null,
        previous_page: null,
        results: [{ ...state.row, instruction_preview: state.row.instruction }],
      });
    if (path.endsWith("/start/")) {
      state.starts++;
      expect(request.headers()["x-csrftoken"]).toBe(auth.csrf);
      expect(request.postDataJSON()).toEqual({});
      state.row.processing_available = false;
      state.row.state = state.failStart ? "failed" : "queued";
      if (state.failStart) return fail("PDF_NO_TEXT", 400);
      if (state.loseStart) return route.abort("failed");
      return json({ request: state.row }, 202);
    }
    if (request.method() === "PATCH") {
      state.patches.push(request.postDataJSON());
      state.row.instruction = request.postDataJSON().instruction;
      state.row.processing_available = true;
      return json({ request: state.row });
    }
    if (path.endsWith("/file/"))
      return route.fulfill({
        contentType: "application/pdf",
        body: "%PDF-synthetic",
      });
    expect(path).toBe(`/api/v1/requests/${id}/`);
    expect(request.method()).toBe("GET");
    state.reads++;
    const snapshot = structuredClone(state.row);
    if (state.hold) await state.hold;
    if (state.readError)
      return fail(
        state.readError,
        state.readError === "REQUEST_NOT_FOUND" ? 404 : 403,
      );
    return json({ request: snapshot });
  });
  await page.clock.install();
  await page.goto("/?request=" + id);
  await expect(page.locator(".request-bubble")).toBeVisible();
  return { state, auth };
}
const statusTag = (page) => page.locator(".intake-detail .state-tag");

test("saved instruction gates start; one start and sequential polling stop at completion", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page
    .getByLabel("요청문 수정", { exact: true })
    .fill("새 가상 요청문 😀");
  await expect(
    page.getByRole("button", { name: "검사 시작", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "요청문 저장", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "검사 시작", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "검사 시작", exact: true }).dblclick();
  await expect(statusTag(page)).toHaveText("처리 대기");
  expect(state.starts).toBe(1);
  expect(state.patches).toEqual([{ instruction: "새 가상 요청문 😀" }]);
  await expect(page.getByLabel("요청문 수정", { exact: true })).toHaveCount(0);
  state.row.state = "analyzing";
  await page.clock.fastForward(2100);
  await expect(statusTag(page)).toHaveText("검사 중");
  state.row.state = "processing";
  await page.clock.fastForward(2100);
  await expect(statusTag(page)).toHaveText("처리 중");
  state.row.state = "completed";
  state.row.answer_text = "가상 완료 답변";
  await page.clock.fastForward(2100);
  await expect(page.getByText("가상 완료 답변", { exact: true })).toBeVisible();
  const reads = state.reads;
  await page.clock.fastForward(10000);
  expect(state.reads).toBe(reads);
});

test("PDF-only record requires saving an instruction before start", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.row.instruction = "";
  state.row.processing_available = false;
  state.row.document = {
    original_filename: "synthetic.pdf",
    size_bytes: 100,
    page_count: 1,
    extraction_status: "pending",
  };
  await page.reload();
  await expect(
    page.getByLabel("이 의뢰에 요청문 추가", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "검사 시작", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("이 의뢰에 요청문 추가", { exact: true })
    .fill("PDF 검증 요청");
  await page.getByRole("button", { name: "요청문 저장", exact: true }).click();
  await page.getByRole("button", { name: "검사 시작", exact: true }).click();
  await expect(statusTag(page)).toHaveText("처리 대기");
  expect(state.starts).toBe(1);
});

test("pending read does not overlap; navigation discards late response and stops reads", async ({
  page,
}) => {
  const { state } = await setup(page, "analyzing");
  let release;
  state.hold = new Promise((r) => (release = r));
  const before = state.reads;
  await page.clock.fastForward(2100);
  await expect.poll(() => state.reads).toBe(before + 1);
  await page.clock.fastForward(6000);
  expect(state.reads).toBe(before + 1);
  await page.getByRole("link", { name: "내 계정" }).click();
  state.hold = null;
  release();
  await page.clock.fastForward(10000);
  expect(state.reads).toBe(before + 1);
  await expect(page.locator(".intake-detail")).toHaveCount(0);
});

test("lost start response needs explicit GET and reload never starts work again", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.loseStart = true;
  await page.getByRole("button", { name: "검사 시작", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "서버 응답을 확인하지 못했습니다",
  );
  await expect(
    page.getByRole("button", { name: "검사 시작", exact: true }),
  ).toHaveCount(0);
  await page.clock.fastForward(10000);
  expect(state.starts).toBe(1);
  await page
    .getByRole("button", { name: "상태 다시 조회", exact: true })
    .click();
  await expect(statusTag(page)).toHaveText("처리 대기");
  state.row.state = "analyzing";
  await page.reload();
  await expect(statusTag(page)).toHaveText("검사 중");
  expect(state.starts).toBe(1);
});

test("extraction error persists failed state and is not automatically retried", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.failStart = true;
  await page.getByRole("button", { name: "검사 시작", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("PDF_NO_TEXT");
  await page
    .getByRole("button", { name: "상태 다시 조회", exact: true })
    .click();
  await expect(statusTag(page)).toHaveText("처리 실패");
  await expect(page.getByText(/다시 진행하려면 새 요청/)).toBeVisible();
  await page.clock.fastForward(10000);
  expect(state.starts).toBe(1);
});

test("permission loss clears original PDF and data; session loss returns to login", async ({
  page,
}) => {
  const { state } = await setup(page, "analyzing");
  state.row.document = {
    original_filename: "synthetic.pdf",
    size_bytes: 100,
    page_count: 1,
    extraction_status: "ready",
  };
  await page.reload();
  await page
    .getByRole("button", { name: "PDF 원본 보기", exact: true })
    .click();
  await expect(page.locator("iframe")).toHaveCount(1);
  state.readError = "FORBIDDEN";
  await page.clock.fastForward(2100);
  await expect(page.getByRole("alert")).toContainText("FORBIDDEN");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator(".request-bubble")).toHaveCount(0);
  const reads = state.reads;
  await page.clock.fastForward(6000);
  expect(state.reads).toBe(reads);
  state.readError = "AUTH_REQUIRED";
  await page
    .getByRole("button", { name: "상태 다시 조회", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeVisible();
});

test("read timeout pauses polling without marking processing failed; manual read recovers", async ({
  page,
}) => {
  const { state } = await setup(page, "analyzing");
  let release;
  state.hold = new Promise((r) => (release = r));
  const before = state.reads;
  await page.clock.fastForward(2100);
  await expect.poll(() => state.reads).toBe(before + 1);
  await page.clock.fastForward(15100);
  await expect(page.getByRole("alert")).toContainText(
    "처리가 실패했다는 뜻은 아닙니다",
  );
  state.hold = null;
  release();
  await page
    .getByRole("button", { name: "상태 다시 조회", exact: true })
    .click();
  await expect(statusTag(page)).toHaveText("검사 중");
});

test("approval wait follows server expiry; admin still cannot load employee flow", async ({
  page,
}) => {
  const { state, auth } = await setup(page, "awaiting_approval");
  await expect(statusTag(page)).toHaveText("전송 확인 대기");
  state.row.state = "expired";
  await page.clock.fastForward(2100);
  await expect(statusTag(page)).toHaveText("승인 만료");
  const reads = state.reads;
  await page.clock.fastForward(10000);
  expect(state.reads).toBe(reads);
  auth.current = admin;
  await page.reload();
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.locator(".intake-detail")).toHaveCount(0);
  expect(state.starts).toBe(0);
});
