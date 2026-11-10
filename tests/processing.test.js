import test from "node:test";
import assert from "node:assert/strict";
import { createHttpClient } from "../src/api/http.js";
import { createRequestApi } from "../src/api/requests.js";
import {
  approvalPreview,
  approvalDecision,
  processingRecovery,
} from "../src/api/processing.js";
import {
  createProcessingFixture,
  previewFixture,
  requestId as id,
  inputText,
} from "./fixtures/processing.js";
const user = { id: "owner", role: "user" };
function setup(options) {
  const fixture = createProcessingFixture(options);
  const client = createHttpClient({ fetchImpl: fixture.fetchImpl });
  return { fixture, client, api: createRequestApi(client) };
}
test("four contracts use session/CSRF and exact bodies; approval is not delivery", async () => {
  const { api, fixture } = setup();
  assert.equal((await api.start(user, id)).state, "queued");
  fixture.advance("awaiting_approval");
  assert.equal((await api.preview(user, id)).spans[0].text, "가상회사");
  const result = await api.decide(user, id, "approved");
  assert.equal(result.state, "queued");
  assert.equal(result.delivery_status, undefined);
  assert.equal(result.input_text, undefined);
  assert.equal(await api.hide(user, id), null);
  const posts = fixture.calls.filter((c) => c.method === "POST");
  assert.deepEqual(
    posts.map((c) => JSON.parse(c.body)),
    [{}, { decision: "approved" }, {}],
  );
  for (const call of posts) {
    assert.equal(call.credentials, "include");
    assert.equal(call.headers["X-CSRFToken"], "synthetic-csrf");
  }
  assert.match(posts[0].url, /\/start\/$/);
  assert.match(posts[1].url, /\/approval\/$/);
  assert.match(posts[2].url, /\/hide\/$/);
});
test("code-point offsets preserve emoji and line breaks; invalid spans fail closed", () => {
  const p = approvalPreview(previewFixture(), id);
  assert.equal(p.input_text, inputText);
  assert.equal(inputText.slice(p.spans[0].start, p.spans[0].end), "가상회사");
  assert.equal(p.spans[0].start, p.spans[0].start_offset + 1);
  for (const mutate of [
    (p) => (p.detection_spans[0].end_offset = 999),
    (p) => (p.detection_spans[0].start_offset = -1),
    (p) => (p.detection_spans[0].label = "unknown"),
    (p) => {
      p.detection_spans.push({ ...p.detection_spans[0], id: "other" });
      p.detection_count++;
    },
    (p) => (p.detection_count = 99),
    (p) => (p.request_id = "other"),
    (p) => (p.approval.expires_at = "bad"),
  ]) {
    const data = previewFixture();
    mutate(data.preview);
    assert.throws(
      () => approvalPreview(data, id),
      (e) => e.code === "INVALID_RESPONSE",
    );
  }
});
test("zero detections still require approval; same decision replay and opposite decision conflict", async () => {
  const { api, fixture } = setup({ clean: true });
  fixture.advance("awaiting_approval");
  assert.deepEqual((await api.preview(user, id)).spans, []);
  await api.decide(user, id, "approved");
  fixture.advance("completed");
  const replay = await api.decide(user, id, "approved");
  assert.equal(replay.replayed, true);
  assert.equal(replay.state, "completed");
  await assert.rejects(
    api.decide(user, id, "rejected"),
    (e) => e.code === "APPROVAL_ALREADY_DECIDED",
  );
  await assert.rejects(
    api.preview(user, id),
    (e) => e.code === "APPROVAL_NOT_AVAILABLE",
  );
});
test("fixed expiry is not extended by preview; expiry and rejection remove access", async () => {
  let time = Date.parse("2026-11-11T00:00:00Z");
  const { api, fixture } = setup({ now: () => time });
  fixture.advance("awaiting_approval");
  const first = await api.preview(user, id);
  time += 1000;
  assert.equal((await api.preview(user, id)).expires_at, first.expires_at);
  time += 30 * 60 * 1000;
  await assert.rejects(
    api.preview(user, id),
    (e) => e.code === "APPROVAL_EXPIRED",
  );
  await assert.rejects(
    api.decide(user, id, "approved"),
    (e) => e.code === "APPROVAL_EXPIRED",
  );
  assert.equal((await api.get(user, id)).state, "expired");
  const second = setup();
  second.fixture.advance("awaiting_approval");
  assert.equal(
    (await second.api.decide(user, id, "rejected")).state,
    "rejected",
  );
  await assert.rejects(second.api.preview(user, id));
});
test("admin, invalid IDs and invalid choices are rejected before any HTTP request", async () => {
  const { api, fixture } = setup();
  for (const operation of [
    () => api.start({ ...user, role: "admin" }, id),
    () => api.preview({ ...user, role: "admin" }, id),
    () => api.decide({ ...user, role: "admin" }, id, "approved"),
    () => api.hide({ ...user, role: "admin" }, id),
    () => api.start(user, "../../admin"),
    () => api.decide(user, id, true),
  ])
    await assert.rejects(operation);
  assert.equal(fixture.calls.length, 0);
});
test("same request mutations cannot overlap; read remains available", async () => {
  let release;
  const { fixture } = setup();
  const client = createHttpClient({
    fetchImpl: async (url, opts) => {
      if (url.endsWith("/start/")) await new Promise((r) => (release = r));
      return fixture.fetchImpl(url, opts);
    },
  });
  client.setCsrf("fixture");
  const api = createRequestApi(client);
  const pending = api.start(user, id);
  await assert.rejects(api.hide(user, id), (e) => e.code === "REQUEST_PENDING");
  await assert.rejects(
    api.decide(user, id, "rejected"),
    (e) => e.code === "REQUEST_PENDING",
  );
  assert.equal((await api.get(user, id)).state, "preparing");
  release();
  await pending;
  await api.hide(user, id);
});
test("lost approval response is never retried: GET reconciles the committed decision", async () => {
  const { fixture } = setup();
  fixture.advance("awaiting_approval");
  const client = createHttpClient({
    fetchImpl: async (url, opts) => {
      const response = await fixture.fetchImpl(url, opts);
      if (url.endsWith("/approval/")) throw new TypeError("lost response");
      return response;
    },
  });
  const api = createRequestApi(client);
  await assert.rejects(
    api.decide(user, id, "approved"),
    (e) => processingRecovery(e) === "refresh",
  );
  assert.equal((await api.get(user, id)).state, "queued");
  assert.equal(
    fixture.calls.filter((c) => c.url.endsWith("/approval/")).length,
    1,
  );
});
test("server errors stay errors, no automatic retry or invented success", async () => {
  for (const [code, status, recovery] of [
    ["AUTH_REQUIRED", 403, "session"],
    ["FORBIDDEN", 403, "unavailable"],
    ["REQUEST_NOT_FOUND", 404, "unavailable"],
    ["CSRF_FAILED", 403, "input"],
    ["PREVIEW_NOT_AVAILABLE", 503, "refresh"],
    ["PDF_NO_TEXT", 400, "refresh"],
  ]) {
    const { api, fixture, client } = setup();
    client.setCsrf("fixture");
    fixture.failNext(code, status);
    await assert.rejects(
      api.start(user, id),
      (e) => e.code === code && processingRecovery(e) === recovery,
    );
    assert.equal(fixture.calls.length, 1);
  }
});
test("session changes reject late sensitive preview and preserve abort behavior", async () => {
  let release;
  const client = createHttpClient({
    fetchImpl: async () => {
      await new Promise((r) => (release = r));
      return new Response(JSON.stringify(previewFixture()));
    },
  });
  const api = createRequestApi(client);
  const pending = api.preview(user, id);
  client.clear();
  api.clear();
  release();
  await assert.rejects(pending, (e) => e.code === "SESSION_CHANGED");
  const controller = new AbortController();
  controller.abort();
  const abortApi = createRequestApi({
    request: async (_, { signal }) => {
      signal.throwIfAborted();
    },
  });
  await assert.rejects(
    abortApi.preview(user, id, { signal: controller.signal }),
    (e) => e.name === "AbortError",
  );
});
test("hide is repeatable 204, subsequent detail and preview are inaccessible", async () => {
  const { api, fixture } = setup();
  fixture.advance("awaiting_approval");
  await api.hide(user, id);
  await api.hide(user, id);
  await assert.rejects(
    api.get(user, id),
    (e) => e.code === "REQUEST_NOT_FOUND",
  );
  await assert.rejects(
    api.preview(user, id),
    (e) => e.code === "REQUEST_NOT_FOUND",
  );
});
test("malformed mutation responses cannot become successful operations", async () => {
  const { api, fixture } = setup();
  fixture.advance("awaiting_approval");
  const decision = await api.decide(user, id, "approved");
  assert.throws(() =>
    approvalDecision(
      { request: { ...decision, state: "preparing" } },
      id,
      "approved",
    ),
  );
  const bad = createRequestApi({ request: async () => ({ ok: true }) });
  await assert.rejects(
    bad.hide(user, id),
    (e) => e.code === "INVALID_RESPONSE",
  );
  await assert.rejects(
    bad.start(user, id),
    (e) => e.code === "INVALID_RESPONSE",
  );
});
