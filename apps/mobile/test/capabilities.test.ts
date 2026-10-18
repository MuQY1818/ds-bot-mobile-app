import test from "node:test";
import assert from "node:assert/strict";
import { capabilityStatus } from "../src/logic/capabilities.ts";

test("packs display the host aggregate even when individual child statuses are absent", () => {
  const pack = { name: "research", kind: "pack" as const, items: ["search", "guide"] };
  for (const state of ["ready", "connecting", "needs-approval", "error"] as const) {
    const status = { state, ...(state === "error" ? { error: "Search unavailable" } : {}) };
    assert.deepEqual(capabilityStatus(pack, { research: status }), status);
  }
  assert.equal(capabilityStatus(pack, {}), undefined);
});

test("individual capabilities and older child-only pack states retain connection errors", () => {
  const error = { state: "error" as const, error: "Connection failed" };
  assert.equal(capabilityStatus({ name: "search", kind: "mcp" }, { search: error }), error);
  assert.equal(capabilityStatus({ name: "research", kind: "pack", items: ["search", "guide"] }, { guide: { state: "ready" }, search: error }), error);
});
