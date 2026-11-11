import test from "node:test";
import assert from "node:assert/strict";
import { createHttpClient } from "../src/api/http.js";
import { createAuthApi } from "../src/api/auth.js";
import {
  createRequestApi,
  validateIntake,
  MAX_PDF_BYTES,
} from "../src/api/requests.js";

const user = { id: "test-user", role: "user" };
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const value = {
  request_id: id,
  client_request_key: id,
  instruction: "",
  state: "preparing",
  processing_available: false,
  document: null,
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

test("multipart preserves PDF bytes and text, uses shared login CSRF and browser boundary", async () => {
  const calls = [];
  const client = createHttpClient({
    fetchImpl: async (path, options) => {
      calls.push({ path, options });
      if (path.endsWith("/csrf/")) return json({ csrf_token: "before" });
      if (path.endsWith("/login/"))
        return json({
          user: { ...user, username: "USER0001", full_name: "시험" },
          session_expires_at: new Date(Date.now() + 3600000).toISOString(),
          csrf_token: "rotated",
        });
      return json({ request: value, replayed: false }, 201);
    },
  });
  await createAuthApi(client).login("USER0001", "fixture");
  const file = new File(["%PDF-1.4\nsynthetic"], "sample.pdf", {
    type: "application/pdf",
  });
  await createRequestApi(client).create(user, {
    key: id,
    instruction: "  줄바꿈\n😀  ",
    file,
  });
  const request = calls.at(-1).options;
  assert.ok(request.body instanceof FormData);
  assert.equal(request.headers["Content-Type"], undefined);
  assert.equal(request.headers["X-CSRFToken"], "rotated");
  assert.equal(request.credentials, "include");
  assert.equal(request.body.get("client_request_key"), id);
  assert.equal(request.body.get("instruction"), "  줄바꿈\n😀  ");
  assert.equal(await request.body.get("pdf").text(), await file.text());
});
test("failed intake never retries automatically; explicit replay preserves its original key", async () => {
  const bodies = [];
  const client = createHttpClient({
    fetchImpl: async (_, options) => {
      bodies.push(options.body);
      if (bodies.length === 1) throw new TypeError("lost response");
      return json({ request: value, replayed: true });
    },
  });
  client.setCsrf("fixture");
  const api = createRequestApi(client);
  const draft = { key: id, instruction: "검증" };
  await assert.rejects(
    api.create(user, draft),
    (e) => e.code === "NETWORK_ERROR",
  );
  assert.equal(bodies.length, 1);
  assert.equal((await api.create(user, draft)).replayed, true);
  assert.equal(bodies[0], bodies[1]);
});
test("PDF success stays binary; JSON authorization/file errors and HTML success stay errors", async () => {
  const good = createHttpClient({
    fetchImpl: async () =>
      new Response("%PDF-test", {
        headers: { "Content-Type": "application/pdf" },
      }),
  });
  assert.equal(
    await (await createRequestApi(good).file(user, id)).text(),
    "%PDF-test",
  );
  for (const [status, code] of [
    [401, "AUTH_REQUIRED"],
    [403, "FORBIDDEN"],
    [404, "DOCUMENT_NOT_FOUND"],
  ]) {
    const client = createHttpClient({
      fetchImpl: async () =>
        json({ error: { code, message: "권한 또는 파일 오류" } }, status),
    });
    await assert.rejects(
      createRequestApi(client).file(user, id),
      (e) => e.code === code && e.status === status,
    );
  }
  const html = createHttpClient({
    fetchImpl: async () =>
      new Response("<h1>wrong server</h1>", {
        headers: { "Content-Type": "text/html" },
      }),
  });
  await assert.rejects(
    createRequestApi(html).file(user, id),
    (e) => e.code === "INVALID_RESPONSE",
  );
});
test("a PDF finishing after session clear is discarded", async () => {
  let release, started;
  const reading = new Promise((r) => {
    started = r;
  });
  const pending = new Promise((r) => {
    release = r;
  });
  const client = createHttpClient({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "Content-Type": "application/pdf" }),
      blob: () => {
        started();
        return pending;
      },
    }),
  });
  const downloading = createRequestApi(client).file(user, id);
  const rejected = assert.rejects(
    downloading,
    (e) => e.code === "SESSION_CHANGED",
  );
  await reading;
  client.clear();
  release(new Blob(["%PDF-test"]));
  await rejected;
});
test("intake validates exact decimal file limit and Unicode character count", () => {
  assert.equal(
    validateIntake("", { name: "test.pdf", size: MAX_PDF_BYTES }),
    null,
  );
  assert.match(
    validateIntake("", { name: "test.pdf", size: MAX_PDF_BYTES + 1 }),
    /10,000,000/,
  );
  assert.equal(validateIntake("😀".repeat(4000), null), null);
  assert.match(validateIntake("😀".repeat(4001), null), /4,000/);
  assert.match(validateIntake("  ", { name: "test.pdf", size: 100 }), /공백/);
  assert.match(validateIntake("", null), /요청문/);
  assert.match(validateIntake("", { name: "empty.pdf", size: 0 }), /빈 파일/);
});
test("employee request API excludes admin; file endpoint never follows metadata URLs", async () => {
  const calls = [];
  const api = createRequestApi(
    createHttpClient({
      fetchImpl: async (path) => {
        calls.push(path);
        return new Response("%PDF-test", {
          headers: { "Content-Type": "application/pdf" },
        });
      },
    }),
  );
  await assert.rejects(
    api.create({ role: "admin" }, { key: id, instruction: "x" }),
    (e) => e.code === "FORBIDDEN",
  );
  await assert.rejects(
    api.get({ role: "admin" }, id),
    (e) => e.code === "FORBIDDEN",
  );
  await assert.rejects(
    api.listPage({ role: "admin" }),
    (e) => e.code === "FORBIDDEN",
  );
  assert.equal(calls.length, 0);
  await api.file({ role: "admin" }, id);
  assert.equal(calls[0], `/api/v1/requests/${id}/file/`);
  await assert.rejects(
    api.file(user, "https://other.example/pdf"),
    (e) => e.code === "REQUEST_NOT_FOUND",
  );
  assert.equal(calls.length, 1);
});
