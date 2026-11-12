import { test, expect } from "@playwright/test";
import { installAuthFixture, employee } from "./auth-fixture.js";

const pdfFixture = {
  name: "synthetic.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\nSynthetic fixture only"),
};
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function record(instruction = "", document = null) {
  return {
    request_id: id,
    client_request_key: id,
    instruction,
    state: "preparing",
    created_at: "2026-11-10T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
    processing_available: false,
    document,
    answer_text: null,
    finished_at: null,
  };
}
async function setup(page) {
  const auth = await installAuthFixture(page, { signedIn: employee });
  const state = {
    rows: [],
    posts: [],
    patches: [],
    gets: [],
    losePost: false,
    losePatch: false,
    pdfError: false,
    deny: false,
    keyConflict: false,
  };
  await page.route("**/api/v1/requests/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const reply = (status, body) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const fail = (status, code, message = code) =>
      reply(status, { error: { code, message } });
    if (method !== "GET") expect(req.headers()["x-csrftoken"]).toBe(auth.csrf);
    if (method === "POST" && url.pathname === "/api/v1/requests/") {
      let body, file;
      if (req.headers()["content-type"].startsWith("multipart/form-data")) {
        expect(req.headers()["content-type"]).toContain("boundary=");
        const form = await new Request(req.url(), {
          method: "POST",
          headers: req.headers(),
          body: req.postDataBuffer(),
        }).formData();
        body = {
          client_request_key: form.get("client_request_key"),
          instruction: form.get("instruction"),
        };
        file = form.get("pdf");
        expect([...form.keys()].sort()).toEqual([
          "client_request_key",
          "instruction",
          "pdf",
        ]);
      } else body = req.postDataJSON();
      state.posts.push({
        ...body,
        file: file ? { name: file.name, text: await file.text() } : null,
      });
      if (state.holdPost) await state.holdPost;
      if (state.keyConflict)
        return fail(
          409,
          "REQUEST_KEY_CONFLICT",
          "다른 입력에는 새 접수 키를 사용해 주세요.",
        );
      if (state.pdfError)
        return fail(400, "INVALID_PDF", "PDF 파일을 읽을 수 없습니다.");
      const prior = state.rows.find(
        (r) => r.client_request_key === body.client_request_key,
      );
      const row = prior || {
        ...record(
          body.instruction,
          file
            ? {
                original_filename: file.name,
                size_bytes: file.size,
                page_count: 1,
                extraction_status: "pending",
                file_url: `/api/v1/requests/${id}/file/`,
              }
            : null,
        ),
        client_request_key: body.client_request_key,
      };
      if (!prior) state.rows.unshift(row);
      if (state.losePost) {
        state.losePost = false;
        return route.abort("failed");
      }
      return reply(prior ? 200 : 201, { request: row, replayed: !!prior });
    }
    if (method === "GET" && url.pathname === "/api/v1/requests/") {
      const pageNumber = Number(url.searchParams.get("page"));
      const pageSize = Number(url.searchParams.get("page_size"));
      const pages = Math.max(1, Math.ceil(state.rows.length / pageSize));
      state.gets.push(url.search);
      return reply(200, {
        count: state.rows.length,
        page: pageNumber,
        page_size: pageSize,
        total_pages: pages,
        next_page: pageNumber < pages ? pageNumber + 1 : null,
        previous_page: pageNumber > 1 ? pageNumber - 1 : null,
        results: state.rows
          .slice((pageNumber - 1) * pageSize, pageNumber * pageSize)
          .map((r) => ({
            ...r,
            instruction_preview: r.instruction.slice(0, 200),
          })),
      });
    }
    const row = state.rows.find((r) =>
      url.pathname.startsWith(`/api/v1/requests/${r.request_id}/`),
    );
    if (state.deny || !row)
      return fail(404, "REQUEST_NOT_FOUND", "의뢰를 찾을 수 없습니다.");
    if (method === "GET" && url.pathname.endsWith("/file/"))
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: pdfFixture.buffer,
      });
    if (method === "GET") return reply(200, { request: row });
    if (method === "PATCH") {
      const body = req.postDataJSON();
      state.patches.push(body);
      expect(Object.keys(body)).toEqual(["instruction"]);
      if (state.losePatch) {
        state.losePatch = false;
        return route.abort("failed");
      }
      row.instruction = body.instruction;
      return reply(200, { request: row });
    }
    throw new Error(`Unexpected business operation ${method} ${url.pathname}`);
  });
  return { state, auth };
}

async function fileDrag(page, files) {
  return page.evaluateHandle((items) => {
    const transfer = new DataTransfer();
    for (const item of items) {
      const contents =
        item.size === undefined ? item.text : new Uint8Array(item.size);
      transfer.items.add(
        new File([contents], item.name, {
          type: item.type || "application/pdf",
        }),
      );
    }
    return transfer;
  }, files);
}

test("PDF drop highlights the composer and Enter submits the exact PDF and prompt once", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto("/");
  const input = page.getByLabel("요청 내용", { exact: true });
  const prompt = "  드래그 PDF\n😀 요청문 보존  ";
  await input.fill(prompt);
  const transfer = await fileDrag(page, [
    { name: "drag.pdf", text: pdfFixture.buffer.toString() },
  ]);
  await page
    .locator(".composer")
    .dispatchEvent("dragenter", { dataTransfer: transfer });
  await expect(page.locator(".composer").getByRole("status")).toContainText(
    "PDF 파일 1개를 놓아 첨부하세요.",
  );
  await input.dispatchEvent("dragenter", { dataTransfer: transfer });
  await input.dispatchEvent("dragleave", { dataTransfer: transfer });
  await expect(page.locator(".composer")).toHaveClass(/drag-active/);
  await input.dispatchEvent("dragover", { dataTransfer: transfer });
  await input.dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
  await expect(page.locator(".composer")).not.toHaveClass(/drag-active/);
  await expect(page.locator(".file-chip")).toContainText("drag.pdf");
  expect(state.posts).toHaveLength(0);
  await input.press("Enter");
  await expect(page).toHaveURL(new RegExp(id));
  expect(state.posts).toHaveLength(1);
  // Browsers serialize text-field line breaks as CRLF in multipart/form-data.
  expect(state.posts[0].instruction).toBe(prompt.replace(/\n/g, "\r\n"));
  expect(state.posts[0].file).toEqual({
    name: "drag.pdf",
    text: pdfFixture.buffer.toString(),
  });
});

test("invalid and multiple drops preserve the current file, while a valid PDF replaces it", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto("/");
  await page.getByLabel("요청 내용", { exact: true }).fill("보존할 요청문");
  await page.locator("#intake-pdf").setInputFiles(pdfFixture);
  for (const files of [
    [{ name: "wrong.txt", text: "text", type: "text/plain" }],
    [{ name: "empty.pdf", text: "" }],
    [{ name: "large.pdf", size: 10_000_001 }],
    [
      { name: "one.pdf", text: "first" },
      { name: "two.pdf", text: "second" },
    ],
  ]) {
    const transfer = await fileDrag(page, files);
    await page
      .locator(".composer")
      .dispatchEvent("drop", { dataTransfer: transfer });
    await transfer.dispose();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".file-chip")).toContainText(pdfFixture.name);
    await expect(page.getByLabel("요청 내용", { exact: true })).toHaveValue(
      "보존할 요청문",
    );
  }
  const replacement = await fileDrag(page, [
    { name: "replacement.pdf", text: "%PDF replacement" },
  ]);
  await page
    .locator(".composer")
    .dispatchEvent("drop", { dataTransfer: replacement });
  await replacement.dispose();
  await expect(page.locator(".file-chip")).toContainText("replacement.pdf");
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
  await page.getByRole("button", { name: "첨부 제거" }).click();
  await expect(page.locator(".file-chip")).toHaveCount(0);
});

test("Shift Enter creates a newline and Korean composition Enter never submits", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto("/");
  const input = page.getByLabel("요청 내용", { exact: true });
  await input.fill("첫 줄");
  await input.press("End");
  await input.press("Shift+Enter");
  await input.pressSequentially("second");
  await expect(input).toHaveValue("첫 줄\nsecond");
  await input.dispatchEvent("compositionstart");
  await input.dispatchEvent("keydown", { key: "Enter", keyCode: 13 });
  await input.dispatchEvent("compositionend");
  await input.dispatchEvent("keydown", {
    key: "Enter",
    isComposing: true,
    keyCode: 13,
  });
  await input.dispatchEvent("keydown", { key: "Enter", keyCode: 229 });
  await input.dispatchEvent("keydown", {
    key: "Enter",
    keyCode: 13,
    repeat: true,
  });
  expect(state.posts).toHaveLength(0);
  await input.press("Enter");
  await expect(page).toHaveURL(new RegExp(id));
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].instruction).toBe("첫 줄\nsecond");
});

test("pending intake blocks more Enter events and drops and lost receipt keeps the original bytes", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.losePost = true;
  let release;
  state.holdPost = new Promise((resolve) => {
    release = resolve;
  });
  await page.goto("/");
  const input = page.getByLabel("요청 내용", { exact: true });
  await input.fill("중복 방지");
  await page.locator("#intake-pdf").setInputFiles(pdfFixture);
  await input.press("Enter");
  await expect(input).toBeDisabled();
  await input.dispatchEvent("keydown", { key: "Enter", keyCode: 13 });
  const transfer = await fileDrag(page, [
    { name: "ignored.pdf", text: "other" },
  ]);
  await page
    .locator(".composer")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator(".file-chip")).toContainText(pdfFixture.name);
  expect(state.posts).toHaveLength(1);
  release();
  await expect(page.getByRole("alert")).toContainText(
    "서버 응답을 확인하지 못했습니다",
  );
  await page
    .locator(".composer")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await transfer.dispose();
  await expect(page.locator(".file-chip")).toContainText(pdfFixture.name);
  await input.dispatchEvent("keydown", { key: "Enter", keyCode: 13 });
  expect(state.posts).toHaveLength(1);
  await page
    .getByRole("button", { name: "같은 접수 번호로 확인", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(id));
  expect(state.posts).toHaveLength(2);
  expect(state.posts[0]).toEqual(state.posts[1]);
  expect(state.rows).toHaveLength(1);
});

test("PDF-first intake adds instruction to the same request and reload never creates a request", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto("/");
  await page.locator("#intake-pdf").setInputFiles(pdfFixture);
  await page.getByRole("button", { name: "요청 접수", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(id));
  await expect(
    page.getByText("접수 완료 · 준비 중", { exact: true }).last(),
  ).toBeVisible();
  await expect(page.getByText(/추출 대기/)).toBeVisible();
  await page
    .getByLabel("이 의뢰에 요청문 추가", { exact: true })
    .fill("  요청문\n😀 공백 보존  ");
  await page.getByRole("button", { name: "요청문 저장", exact: true }).click();
  await expect(
    page.getByText(
      "같은 의뢰에 요청문을 저장했습니다. AI 처리는 시작하지 않았습니다.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("요청문 수정", { exact: true })).toHaveValue(
    "  요청문\n😀 공백 보존  ",
  );
  await page
    .getByRole("button", { name: "PDF 원본 보기", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "PDF 원본 다운로드" }),
  ).toHaveAttribute("href", /^blob:/);
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].instruction).toBe("");
  expect(state.posts[0].file.text).toBe(pdfFixture.buffer.toString());
  expect(state.patches).toHaveLength(1);
  expect(state.rows).toHaveLength(1);
  await expect(page.getByRole("button", { name: "가리고 보내기" })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).concat(Object.keys(sessionStorage)),
    ),
  ).toEqual([]);
});

test("lost receipt keeps immutable payload/key across account-screen navigation and explicit replay recovers one request", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.losePost = true;
  await page.goto("/");
  await page.getByLabel("요청 내용", { exact: true }).fill("응답 유실 시험");
  await page.locator("#intake-pdf").setInputFiles(pdfFixture);
  await page.getByRole("button", { name: "요청 접수", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "서버 응답을 확인하지 못했습니다",
  );
  expect(state.posts).toHaveLength(1);
  expect(state.rows).toHaveLength(1);
  await expect(page.getByLabel("요청 내용", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "내 계정 설정", exact: true }).click();
  await page.goBack();
  await expect(page.getByLabel("요청 내용", { exact: true })).toHaveValue(
    "응답 유실 시험",
  );
  await page
    .getByRole("button", { name: "같은 접수 번호로 확인", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(id));
  expect(state.posts).toHaveLength(2);
  expect(state.posts[0]).toEqual(state.posts[1]);
  expect(state.rows).toHaveLength(1);
});

test("failed instruction update preserves user draft while reconciling the stored version", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.rows = [record("이전 요청문")];
  state.losePatch = true;
  await page.goto("/?request=" + id);
  await page
    .getByLabel("요청문 수정", { exact: true })
    .fill("보존해야 할 새 초안");
  await page.getByRole("button", { name: "요청문 저장", exact: true }).click();
  await expect(page.getByText(/작성한 내용은 보존했으니/)).toBeVisible();
  await expect(page.getByLabel("요청문 수정", { exact: true })).toHaveValue(
    "보존해야 할 새 초안",
  );
  expect(state.patches).toHaveLength(1);
  expect(state.rows[0].instruction).toBe("이전 요청문");
  await page
    .getByRole("button", { name: "상태 다시 조회", exact: true })
    .click();
  await expect(page.getByLabel("요청문 수정", { exact: true })).toHaveValue(
    "보존해야 할 새 초안",
  );
  await page.getByRole("button", { name: "요청문 저장", exact: true }).click();
  await expect(
    page.getByText(
      "같은 의뢰에 요청문을 저장했습니다. AI 처리는 시작하지 않았습니다.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(state.patches).toHaveLength(2);
});

test("key conflict only starts a fresh key after explicit recovery and never auto-submits", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.keyConflict = true;
  await page.goto("/");
  await page.getByLabel("요청 내용", { exact: true }).fill("충돌 확인 요청");
  await page.getByRole("button", { name: "요청 접수", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("새 접수 키");
  await expect(page.getByLabel("요청 내용", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "새 접수 번호로 작성", exact: true })
    .click();
  await expect(page.getByLabel("요청 내용", { exact: true })).toBeEnabled();
  expect(state.posts).toHaveLength(1);
  state.keyConflict = false;
  await page.getByRole("button", { name: "요청 접수", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(id));
  expect(state.posts).toHaveLength(2);
  expect(state.posts[0].client_request_key).not.toBe(
    state.posts[1].client_request_key,
  );
});

test("file limit blocks upload locally; server rejection preserves editable input; inaccessible detail has no stale PDF", async ({
  page,
}) => {
  const { state } = await setup(page);
  await page.goto("/");
  await page
    .locator("#intake-pdf")
    .setInputFiles({ ...pdfFixture, buffer: Buffer.alloc(10_000_001) });
  await expect(page.getByRole("alert")).toContainText("10,000,000");
  expect(state.posts).toHaveLength(0);
  state.pdfError = true;
  await page.locator("#intake-pdf").setInputFiles(pdfFixture);
  await page.getByRole("button", { name: "요청 접수", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "PDF 파일을 읽을 수 없습니다",
  );
  await expect(page.getByRole("button", { name: "첨부 제거" })).toBeEnabled();
  await expect(page.getByLabel("요청 내용", { exact: true })).toBeEnabled();
  state.deny = true;
  await page.goto("/?request=" + id);
  await expect(page.getByRole("alert")).toContainText(
    "의뢰를 찾을 수 없습니다",
  );
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "PDF 원본 보기" })).toHaveCount(
    0,
  );
});

test("request history pages use server pagination without re-submitting and mobile detail fits", async ({
  page,
}) => {
  const { state } = await setup(page);
  state.rows = Array.from({ length: 21 }, (_, i) => ({
    ...record(`검증 ${i + 1}`),
    request_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i + 1).padStart(12, "0")}`,
  }));
  await page.goto("/");
  await page.getByRole("button", { name: "다음 요청", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "검증 21 접수 완료 · 준비 중",
      exact: true,
    }),
  ).toBeVisible();
  expect(state.gets).toContain("?page=2&page_size=20");
  await page
    .getByRole("button", { name: "검증 21 접수 완료 · 준비 중", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("요청문 수정", { exact: true })).toHaveValue(
    "검증 21",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(state.posts).toHaveLength(0);
});
