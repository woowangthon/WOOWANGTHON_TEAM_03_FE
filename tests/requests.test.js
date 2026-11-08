import test from "node:test";
import assert from "node:assert/strict";
import { createMockRequests } from "../src/api/mockRequests.js";
import {
  splitHighlights,
  validateInstruction,
} from "../src/domain/requests.js";

const user = { id: "owner" };
test("external requests with zero spans still require approval, and approval cannot repeat", async () => {
  let time = 0;
  const api = createMockRequests({ now: () => time, id: () => "r1" });
  const created = await api.create(user, "일정을 정리해 주세요.", "clean");
  time = 2000;
  const confirmation = await api.get(user, created.id);
  assert.equal(confirmation.state, "awaiting_approval");
  assert.deepEqual(confirmation.spans, []);
  const approved = await api.approve(user, created.id, true);
  assert.equal(approved.spans, undefined);
  await assert.rejects(
    api.approve(user, created.id, true),
    (e) => e.code === "STATE_CONFLICT",
  );
});
test("expired and rejected requests cannot send; ownership is enforced", async () => {
  let time = 0;
  let seq = 0;
  const api = createMockRequests({ now: () => time, id: () => String(++seq) });
  const r = await api.create(user, "한빛기술", "external");
  time = 2000;
  await api.get(user, r.id);
  await assert.rejects(
    api.get({ id: "other" }, r.id),
    (e) => e.code === "FORBIDDEN",
  );
  time += 30 * 60 * 1000;
  assert.equal((await api.get(user, r.id)).state, "expired");
  await assert.rejects(api.approve(user, r.id, true));
  const r2 = await api.create(user, "한빛기술", "external");
  time += 2000;
  await api.get(user, r2.id);
  const rejected = await api.approve(user, r2.id, false);
  assert.equal(rejected.state, "rejected");
  assert.equal(rejected.delivery, "not_sent");
  assert.equal(rejected.spans, undefined);
});
test("highlight offsets verify actual substring including emoji, not just bounds", () => {
  const text = "😀\n한빛기술";
  assert.equal(
    splitHighlights(text, [
      { start: 3, end: 7, text: "한빛기술", label: "회사명" },
    ])[1].text,
    "한빛기술",
  );
  assert.equal(
    splitHighlights(text, [{ start: 2, end: 6, text: "한빛기술" }]),
    null,
  );
  assert.equal(
    validateInstruction("😀".repeat(4001)),
    "요청문은 4,000자 이내로 입력해 주세요.",
  );
});
