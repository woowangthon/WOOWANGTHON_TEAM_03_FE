import { test, expect } from "@playwright/test";
import { installAuthFixture, employee, admin } from "./auth-fixture.js";
import {
  inputText,
  previewFixture,
  combinedPreviewFixture,
} from "../fixtures/processing.js";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
async function setup(page, initial = "preparing") {
  const auth = await installAuthFixture(page, { signedIn: employee });
  const clockStart = Date.now();
  const state = {
    starts: 0,
    reads: 0,
    patches: [],
    hold: null,
    loseStart: false,
    failStart: false,
    readError: null,
    listReads: 0,
    hides: [],
    hidden: false,
    holdHide: null,
    loseHide: false,
    hideError: null,
    previewReads: 0,
    preview: null,
    previewError: null,
    holdPreview: null,
    decisions: [],
    holdDecision: null,
    decisionError: null,
    loseDecision: false,
    clean: false,
    expiresAt: new Date(clockStart + 30 * 60 * 1000).toISOString(),
    row: {
      request_id: id,
      instruction: "가상 문서를 요약해 주세요.",
      state: initial,
      processing_available: initial === "preparing",
      document: null,
      answer_text: initial === "completed" ? "검증용 최종 답변\n둘째 줄" : null,
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
    if (path === "/api/v1/requests/") {
      state.listReads++;
      return json({
        count: state.hidden ? 0 : 1,
        page: 1,
        page_size: 20,
        total_pages: 1,
        next_page: null,
        previous_page: null,
        results: state.hidden
          ? []
          : [{ ...state.row, instruction_preview: state.row.instruction }],
      });
    }
    if (path === `/api/v1/requests/${id}/hide/`) {
      expect(request.method()).toBe("POST");
      expect(request.headers()["x-csrftoken"]).toBe(auth.csrf);
      state.hides.push(request.postDataJSON());
      if (state.holdHide) await state.holdHide;
      if (state.hideError) return fail(...state.hideError);
      state.hidden = true;
      if (state.loseHide) return route.abort("failed");
      return route.fulfill({ status: 204 });
    }
    if (state.hidden) return fail("REQUEST_NOT_FOUND", 404);
    if (path.endsWith("/approval-preview/")) {
      expect(request.method()).toBe("GET");
      state.previewReads++;
      if (state.holdPreview) await state.holdPreview;
      if (state.previewError) return fail(...state.previewError);
      return json(
        state.preview ||
          previewFixture({ clean: state.clean, expiresAt: state.expiresAt }),
      );
    }
    if (path.endsWith("/approval/")) {
      expect(request.method()).toBe("POST");
      expect(request.headers()["x-csrftoken"]).toBe(auth.csrf);
      const body = request.postDataJSON();
      expect(Object.keys(body)).toEqual(["decision"]);
      state.decisions.push(body.decision);
      if (state.holdDecision) await state.holdDecision;
      if (state.decisionError) return fail(...state.decisionError);
      state.row.state = body.decision === "approved" ? "queued" : "rejected";
      if (state.loseDecision) return route.abort("failed");
      return json({
        request: {
          request_id: id,
          state: state.row.state,
          approval: {
            status: body.decision,
            expires_at: state.expiresAt,
            decided_at: new Date().toISOString(),
          },
          replayed: false,
        },
      });
    }
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
  // Keep server expiry and browser time aligned even on a busy test machine.
  await page.clock.install({ time: clockStart - 1000 });
  await page.clock.pauseAt(clockStart);
  await page.goto("/?request=" + id);
  await expect(
    page.locator(
      initial === "completed" ? ".markdown-answer" : ".request-bubble",
    ),
  ).toBeVisible();
  return { state, auth };
}
const statusTag = (page) => page.locator(".intake-detail .state-tag");

test("completed view shows only the answer and tools, while more options preserve recovery", async ({
  page,
}, testInfo) => {
  const { state } = await setup(page, "completed");
  const detail = page.locator(".intake-detail");
  await expect(
    detail.locator(".response-heading, .request-id, .request-bubble"),
  ).toHaveCount(0);
  await expect(
    detail.getByRole("heading", { name: "서버에 저장된 답변" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "상태 다시 조회", exact: true }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "목록에서 숨기기", exact: true }),
  ).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath("clean-answer.png"),
    animations: "disabled",
  });
  const more = page.getByLabel("답변 더보기", { exact: true });
  await more.click();
  await page
    .getByRole("button", { name: "요청 정보 보기", exact: true })
    .click();
  await expect(detail.locator(".request-bubble")).toBeVisible();
  await more.click();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await expect(
    page.getByRole("button", { name: "상태 다시 조회", exact: true }),
  ).toBeHidden();
  state.readError = "FORBIDDEN";
  await more.click();
  await page
    .getByRole("button", { name: "상태 다시 조회", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("FORBIDDEN");
  await expect(page.locator(".markdown-answer, .request-bubble")).toHaveCount(
    0,
  );
});

test("completed request with missing answer keeps visible retry access", async ({
  page,
}) => {
  const { state } = await setup(page, "completed");
  state.row.answer_text = "";
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "답변을 불러오지 못했습니다",
  );
  state.row.answer_text = "다시 불러온 답변";
  await page
    .getByRole("button", { name: "상태 다시 조회", exact: true })
    .click();
  await expect(page.locator(".markdown-answer")).toHaveText(
    state.row.answer_text,
  );
});

test("five minutes of processing pauses reads, keeps the last state and recovers by GET", async ({
  page,
}) => {
  const { state } = await setup(page, "queued");
  await page.clock.fastForward(120000);
  await expect(
    page.getByText("상태 확인을 시작한 뒤 2분 0초가 지났습니다."),
  ).toBeVisible();
  state.row.state = "analyzing";
  await page.clock.fastForward(2100);
  await expect(statusTag(page)).toHaveText("검사 중");
  await page.clock.fastForward(176900);
  await expect(
    page.getByText("상태 확인을 시작한 뒤 4분 59초가 지났습니다."),
  ).toBeVisible();
  await page.clock.fastForward(1000);
  await expect(
    page.getByText(/5분 동안 처리 완료를 확인하지 못해/),
  ).toBeVisible();
  await expect(statusTag(page)).toHaveText("검사 중");
  const reads = state.reads;
  await page.clock.fastForward(60000);
  expect(state.reads).toBe(reads);
  state.row.state = "completed";
  state.row.answer_text = "서버에 저장된 최종 답변";
  await page
    .getByRole("button", { name: "상태 다시 조회", exact: true })
    .click();
  await expect(page.locator(".markdown-answer")).toBeVisible();
  await expect(
    page.getByText(/5분 동안 처리 완료를 확인하지 못해/),
  ).toHaveCount(0);
  expect(state.starts).toBe(0);
  expect(state.decisions).toEqual([]);
});

test("approval countdown continues beyond five minutes and an approval starts a fresh processing wait", async ({
  page,
}) => {
  const { state } = await setup(page, "awaiting_approval");
  await expect(page.locator(".approval-review")).toBeVisible();
  await page.clock.fastForward(6 * 60 * 1000);
  await expect(page.locator(".approval-review")).toBeVisible();
  await expect(page.locator(".approval-deadline")).toContainText("24분");
  await expect(
    page.getByText(/5분 동안 처리 완료를 확인하지 못해/),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "외부 전송 승인", exact: true })
    .click();
  await expect(statusTag(page)).toHaveText("처리 대기");
  await expect(
    page.getByRole("button", { name: "상태 다시 조회", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(299000);
  await expect(
    page.getByText(/5분 동안 처리 완료를 확인하지 못해/),
  ).toHaveCount(0);
  await page.clock.fastForward(1000);
  await expect(
    page.getByText(/5분 동안 처리 완료를 확인하지 못해/),
  ).toBeVisible();
  expect(state.decisions).toEqual(["approved"]);
});

test("wait limit aborts an outstanding read and ignores its late result until a manual read", async ({
  page,
}) => {
  const { state } = await setup(page, "processing");
  await page.clock.fastForward(297000);
  await expect(
    page.getByText("상태 확인을 시작한 뒤 4분 57초가 지났습니다."),
  ).toBeVisible();
  state.row.state = "completed";
  state.row.answer_text = "늦게 완료된 답변";
  let release;
  state.hold = new Promise((resolve) => {
    release = resolve;
  });
  const before = state.reads;
  await page.clock.fastForward(2000);
  await expect.poll(() => state.reads).toBe(before + 1);
  await page.clock.fastForward(1000);
  await expect(
    page.getByText(/5분 동안 처리 완료를 확인하지 못해/),
  ).toBeVisible();
  state.hold = null;
  release();
  await page.clock.fastForward(10000);
  await expect(statusTag(page)).toHaveText("처리 중");
  expect(state.reads).toBe(before + 1);
  await page
    .getByRole("button", { name: "상태 다시 조회", exact: true })
    .click();
  await expect(page.locator(".markdown-answer")).toBeVisible();
});

test("combined code-point preview renders both input sources without normalizing its text", async ({
  page,
}) => {
  const { state } = await setup(page, "awaiting_approval");
  state.preview = combinedPreviewFixture(state.expiresAt);
  await page.reload();
  const preview = page.locator(".approval-review");
  await expect(preview.locator("mark")).toHaveText(["김민수", "가상회사"]);
  expect(await preview.locator(".highlight-preview").textContent()).toBe(
    state.preview.preview.input_text,
  );
  await expect(
    preview.locator(".approval-detections li").first(),
  ).toContainText("요청문");
  await expect(preview.locator(".approval-detections li").last()).toContainText(
    "PDF 본문",
  );
  await preview.locator(".approval-detections button").last().click();
  await expect(preview.locator("mark").last()).toBeFocused();
});
const hideButton = (page) =>
  page.getByRole("button", { name: "목록에서 숨기기", exact: true });
async function beginHide(page) {
  if (await page.locator(".answer-options").count())
    await page.getByLabel("답변 더보기", { exact: true }).click();
  await hideButton(page).click();
}
const confirmHideButton = (page) =>
  page.getByRole("button", { name: "숨기기 확인", exact: true });

test("completed result copies only the final answer and reports clipboard failure", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        async writeText(text) {
          if (window.clipboardDenied) throw new Error("denied");
          window.copiedAnswer = text;
        },
      },
    });
  });
  await setup(page, "completed");
  await expect(page.locator(".markdown-answer")).toBeVisible();
  await page.getByRole("button", { name: "답변 복사", exact: true }).click();
  expect(await page.evaluate(() => window.copiedAnswer)).toBe(
    "검증용 최종 답변\n둘째 줄",
  );
  await expect(
    page.getByText("답변을 복사했습니다.", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.clipboardDenied = true;
  });
  await page.getByRole("button", { name: "답변 복사", exact: true }).click();
  await expect(page.getByText(/답변을 복사하지 못했습니다/)).toBeVisible();
});

test("completed markdown renders readable blocks, preserves source copying and fits mobile", async ({
  page,
}, testInfo) => {
  const { state } = await setup(page, "completed");
  const source = [
    "# 가상 보고서",
    "",
    "**핵심 내용**과 `요약 코드`입니다.",
    "둘째 줄도 유지합니다.",
    "",
    "## 검토 항목",
    "",
    "- 첫 항목",
    "  - 하위 항목",
    "- 둘째 항목",
    "",
    "1. 자료 확인",
    "2. 결과 검토",
    "",
    "> 가상 자료를 바탕으로 작성했습니다.",
    "",
    "| 항목 | 결과 | 담당 | 비고 |",
    "| --- | --- | --- | --- |",
    "| 검토 | 완료 | 가상 담당자 | 추가 확인 |",
    "",
    "```js",
    'const example = "' + "synthetic_".repeat(30) + '";',
    "```",
    "",
    "[참고 자료](https://example.com/reference)",
  ].join("\n");
  state.row.answer_text = source;
  await page.reload();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        async writeText(text) {
          window.copiedAnswer = text;
        },
      },
    });
  });
  const answer = page.locator(".markdown-answer");
  await expect(
    answer.getByRole("heading", { name: "가상 보고서", level: 1 }),
  ).toBeVisible();
  await expect(answer.locator("strong")).toHaveText("핵심 내용");
  await expect(answer.locator("ul ul li")).toHaveText("하위 항목");
  await expect(answer.locator("ol li")).toHaveCount(2);
  await expect(answer.locator("blockquote")).toContainText("가상 자료");
  await expect(answer.getByRole("table")).toBeVisible();
  await expect(answer.locator("pre code")).toContainText("const example");
  await expect(answer.locator("p").first()).toHaveCSS(
    "white-space",
    "pre-line",
  );
  await expect(answer.getByRole("link", { name: "참고 자료" })).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );
  await page.getByRole("button", { name: "답변 복사", exact: true }).click();
  expect(await page.evaluate(() => window.copiedAnswer)).toBe(source);
  await answer.screenshot({
    path: testInfo.outputPath("markdown-desktop.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    answer.getByRole("heading", { name: "가상 보고서" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await answer
      .locator("pre")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(true);
  expect(
    await answer
      .locator(".markdown-table")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("markdown-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("markdown cannot execute HTML or unsafe links or load remote images", async ({
  page,
}) => {
  const { state } = await setup(page, "completed");
  state.row.answer_text = [
    "일반 텍스트도 그대로 보입니다.",
    "",
    "<script>window.markdownExecuted = true</script>",
    "",
    '<img src="https://example.com/raw.png" onerror="window.markdownExecuted = true">',
    "",
    "[위험 링크](javascript:alert%281%29)",
    "",
    "![외부 그림](https://example.com/tracker.png)",
    "",
    "```html",
    "<script>표시만 하는 예시</script>",
    "```",
  ].join("\n");
  const remoteRequests = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://example.com/"))
      remoteRequests.push(request.url());
  });
  await page.reload();
  const answer = page.locator(".markdown-answer");
  await expect(answer).toContainText("일반 텍스트도 그대로 보입니다.");
  await expect(
    answer.locator("script, img, a[href^='javascript:']"),
  ).toHaveCount(0);
  await expect(answer.getByRole("link", { name: "위험 링크" })).toHaveCount(0);
  await expect(answer).toContainText("[이미지: 외부 그림]");
  await expect(answer.locator("pre code")).toHaveText(
    "<script>표시만 하는 예시</script>\n",
  );
  expect(await page.evaluate(() => window.markdownExecuted)).toBeUndefined();
  expect(remoteRequests).toEqual([]);
});

for (const [stateName, label, message] of [
  ["blocked", "정책 차단", "보안 정책에 따라 요청을 차단했습니다."],
  ["rejected", "전송 거절", "외부 전송을 거절해 요청이 종료되었습니다."],
  ["expired", "승인 만료", "승인 시간이 지나 요청이 종료되었습니다."],
  ["failed", "처리 실패", "요청 처리를 완료하지 못했습니다."],
]) {
  test(`${stateName} displays its own outcome and offers a new request`, async ({
    page,
  }) => {
    const { state } = await setup(page, stateName);
    state.row.answer_text = "종료 상태에서 표시하면 안 되는 가상 답변";
    await page.reload();
    await expect(statusTag(page)).toHaveText(label);
    await expect(
      page.getByText(message + " 다시 진행하려면 새 요청을 작성해 주세요.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(state.row.answer_text, { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "답변 복사", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: /새 요청 작성/ }).click();
    await expect(page.getByLabel("요청 내용", { exact: true })).toBeVisible();
    expect(state.starts).toBe(0);
  });
}

test("hide confirms intent, refreshes history, closes detail and revokes its PDF", async ({
  page,
}) => {
  const { state } = await setup(page, "completed");
  state.row.document = {
    original_filename: "synthetic.pdf",
    size_bytes: 100,
    page_count: 1,
    extraction_status: "ready",
  };
  await page.reload();
  await page.getByLabel("답변 더보기", { exact: true }).click();
  await page
    .getByRole("button", { name: "요청 정보 보기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "PDF 원본 보기", exact: true })
    .click();
  const frame = page.locator("iframe");
  await expect(frame).toHaveAttribute("src", /^blob:/);
  const blobUrl = await frame.getAttribute("src");
  await beginHide(page);
  await page.getByRole("button", { name: "돌아가기", exact: true }).click();
  expect(state.hides).toEqual([]);
  await beginHide(page);
  await expect(
    page.getByText(/서버 원본과 관리자 감사 기록은 보관됩니다/),
  ).toBeVisible();
  let release;
  state.holdHide = new Promise((resolve) => (release = resolve));
  const listsBefore = state.listReads;
  await confirmHideButton(page).dblclick();
  await expect(
    page.getByRole("button", { name: "숨기는 중…", exact: true }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByText("내 요청 목록에서 숨겼습니다.", { exact: true }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/request=/);
  await expect(page.locator(".intake-detail")).toHaveCount(0);
  await expect(page.locator(".history-title")).toHaveText("최근 요청 0");
  await expect.poll(() => state.listReads).toBeGreaterThan(listsBefore);
  expect(state.hides).toEqual([{}]);
  expect(
    await page.evaluate(async (url) => {
      try {
        await fetch(url);
        return true;
      } catch {
        return false;
      }
    }, blobUrl),
  ).toBe(false);
  await page.goto("/?request=" + id);
  await expect(page.getByRole("alert")).toContainText("REQUEST_NOT_FOUND");
  await expect(frame).toHaveCount(0);
  await expect(hideButton(page)).toHaveCount(0);
});

test("lost hide response refreshes the list and clears details without resending", async ({
  page,
}) => {
  const { state } = await setup(page, "completed");
  state.loseHide = true;
  await beginHide(page);
  await confirmHideButton(page).click();
  await expect(
    page.getByText("목록과 현재 상태를 확인한 뒤 다시 시도해 주세요.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".history-title")).toHaveText("최근 요청 0");
  await expect(page.locator(".request-bubble")).toHaveCount(0);
  await page
    .getByRole("button", { name: "상태 다시 조회", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("REQUEST_NOT_FOUND");
  expect(state.hides).toEqual([{}]);
});

test("hide during approval closes the preview and refreshes history after navigation", async ({
  page,
}) => {
  const { state } = await setup(page, "awaiting_approval");
  await expect(page.locator(".approval-review")).toBeVisible();
  await beginHide(page);
  await expect(
    page.getByText(
      /숨기면 이 의뢰의 외부 전송을 승인하거나 거절할 수 없습니다/,
    ),
  ).toBeVisible();
  let release;
  state.holdHide = new Promise((resolve) => (release = resolve));
  await confirmHideButton(page).click();
  await expect.poll(() => state.hides.length).toBe(1);
  await page.getByRole("button", { name: "내 계정 설정", exact: true }).click();
  release();
  await expect(page.locator(".history-title")).toHaveText("최근 요청 0");
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.locator(".approval-review")).toHaveCount(0);
  expect(state.decisions).toEqual([]);
});

test("hide permission denial clears the detail without claiming success", async ({
  page,
}) => {
  const { state } = await setup(page, "completed");
  state.hideError = ["FORBIDDEN", 403];
  await beginHide(page);
  await confirmHideButton(page).click();
  await expect(page.getByRole("alert")).toContainText("FORBIDDEN");
  await expect(page.locator(".request-bubble")).toHaveCount(0);
  await expect(
    page.getByText("내 요청 목록에서 숨겼습니다.", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "내 계정 설정", exact: true }),
  ).toBeVisible();
  expect(state.hidden).toBe(false);
});

const approvalButton = (page) =>
  page.getByRole("button", { name: "외부 전송 승인", exact: true });
const review = (page) => page.getByRole("region", { name: "외부 전송 확인" });

test("real mode renders exact inspection text and navigable detections, then submits one approval", async ({
  page,
}) => {
  const { state } = await setup(page, "awaiting_approval");
  await expect(review(page).locator("mark")).toHaveText("가상회사");
  expect(await review(page).locator(".highlight-preview").textContent()).toBe(
    inputText,
  );
  await expect(review(page).locator("time")).toHaveAttribute(
    "datetime",
    state.expiresAt,
  );
  await expect(review(page).getByText(/남은 시간/)).toBeVisible();
  await review(page)
    .getByRole("button", { name: /회사명 PDF 본문 가상회사/ })
    .click();
  await expect(review(page).locator("mark")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  let release;
  state.holdDecision = new Promise((resolve) => (release = resolve));
  await approvalButton(page).dblclick();
  await expect(page.getByText("선택 저장 중", { exact: true })).toBeVisible();
  await expect(review(page)).toHaveCount(0);
  release();
  await expect(statusTag(page)).toHaveText("처리 대기");
  await expect(
    page.getByText("외부 전송 승인을 저장했습니다.", { exact: true }),
  ).toBeVisible();
  expect(state.decisions).toEqual(["approved"]);
});

test("zero detections still require a choice and rejection clears the preview", async ({
  page,
}) => {
  const { state } = await setup(page, "awaiting_approval");
  state.clean = true;
  await page.reload();
  await expect(review(page).getByText("탐지 구간 0개")).toBeVisible();
  await expect(review(page)).toContainText(
    "검사 원문을 가리지 않고 외부 AI로 전송합니다.",
  );
  await expect(approvalButton(page)).toBeEnabled();
  expect(state.decisions).toEqual([]);
  await review(page)
    .getByRole("button", { name: "외부 전송 거절", exact: true })
    .click();
  await expect(statusTag(page)).toHaveText("전송 거절");
  await expect(review(page)).toHaveCount(0);
  expect(state.decisions).toEqual(["rejected"]);
});

test("local deadline removes sensitive details before the server state catches up", async ({
  page,
}) => {
  const { state } = await setup(page, "awaiting_approval");
  state.expiresAt = new Date(
    (await page.evaluate(() => Date.now())) + 12000,
  ).toISOString();
  await page.reload();
  await expect(approvalButton(page)).toBeVisible();
  await page.clock.fastForward(12100);
  await expect(
    page.getByText("승인 시간이 만료되었습니다.", { exact: true }),
  ).toBeVisible();
  await expect(review(page)).toHaveCount(0);
  await expect(approvalButton(page)).toHaveCount(0);
  expect(state.decisions).toEqual([]);
});

for (const scenario of [
  { name: "lost decision response", code: null, finalState: "queued" },
  {
    name: "another decision already saved",
    code: "APPROVAL_ALREADY_DECIDED",
    finalState: "rejected",
  },
  {
    name: "server deadline expired",
    code: "APPROVAL_EXPIRED",
    finalState: "expired",
  },
]) {
  test(`${scenario.name} clears details and recovers by GET without resending`, async ({
    page,
  }) => {
    const { state } = await setup(page, "awaiting_approval");
    if (scenario.code) state.decisionError = [scenario.code, 409];
    else state.loseDecision = true;
    await approvalButton(page).click();
    await expect(
      page.getByText("상태를 다시 조회해 저장 결과를 확인해 주세요.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(review(page)).toHaveCount(0);
    await page.clock.fastForward(5000);
    expect(state.decisions).toEqual(["approved"]);
    state.row.state = scenario.finalState;
    await page
      .getByRole("button", { name: "상태 다시 조회", exact: true })
      .click();
    await expect(statusTag(page)).toHaveText(
      { queued: "처리 대기", rejected: "전송 거절", expired: "승인 만료" }[
        scenario.finalState
      ],
    );
    await expect(review(page)).toHaveCount(0);
    expect(state.decisions).toEqual(["approved"]);
  });
}

test("a late preview cannot reappear after polling sees a terminal state", async ({
  page,
}) => {
  const { state } = await setup(page, "analyzing");
  let release;
  state.holdPreview = new Promise((resolve) => (release = resolve));
  state.row.state = "awaiting_approval";
  await page.clock.fastForward(2100);
  await expect.poll(() => state.previewReads).toBe(1);
  state.row.state = "rejected";
  await page.clock.fastForward(2100);
  await expect(statusTag(page)).toHaveText("전송 거절");
  release();
  await expect(review(page)).toHaveCount(0);
  await expect(page.locator("mark")).toHaveCount(0);
});

test("preview access denial clears the request detail and prevents decisions", async ({
  page,
}) => {
  const { state } = await setup(page, "analyzing");
  state.previewError = ["REQUEST_NOT_FOUND", 404];
  state.row.state = "awaiting_approval";
  await page.clock.fastForward(2100);
  await expect(page.getByRole("alert")).toContainText("REQUEST_NOT_FOUND");
  await expect(page.locator(".request-bubble")).toHaveCount(0);
  await expect(review(page)).toHaveCount(0);
  expect(state.decisions).toEqual([]);
});

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
  await page.getByRole("button", { name: "내 계정 설정", exact: true }).click();
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
