// Test file: checks kitchenRules.test behavior and protects it from later changes.
import assert from "node:assert/strict";
import test from "node:test";
import { calculateProgressPercent, calculateProgressTone, cleanKitchenItemNote, formatCountdown, formatStatusChangedAt } from "../app/kitchenRules.ts";

const startedAt = Date.parse("2026-08-01T10:00:00.000Z");
const item = { status: "Cooking", createdAt: "2026-08-01T09:58:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z", cookingAt: "2026-08-01T10:00:00.000Z", prepMinutes: 10 };

test("pending items do not consume their cooking target", () => assert.equal(calculateProgressPercent({ ...item, status: "Pending", cookingAt: undefined }, startedAt + 300_000), 0));
test("calculates progress and countdown from cooking start", () => { assert.equal(calculateProgressPercent(item, startedAt + 420_000), 70); assert.equal(calculateProgressTone(item, startedAt + 420_000), "warning"); assert.equal(formatCountdown(item, startedAt + 420_000), "03:00"); });
test("marks overtime with a negative countdown", () => { assert.equal(calculateProgressTone(item, startedAt + 660_000), "danger"); assert.equal(formatCountdown(item, startedAt + 660_000), "-01:00"); });
test("history uses the final lifecycle timestamp", () => {
  const servedAt = "2026-08-01T10:09:00.000Z";
  const expected = new Date(servedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  assert.equal(formatStatusChangedAt({ ...item, status: "Served", servedAt }), expected);
});
test("removes dietary alerts but preserves special requests", () => assert.equal(cleanKitchenItemNote("Dietary alert: Eggs · Anniversary · No onion"), "Anniversary / No onion"));
