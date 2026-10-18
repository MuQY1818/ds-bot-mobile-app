import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { releaseTarget } = createRequire(import.meta.url)("../../../scripts/release-target.cjs");
test("a release revision uses a distinct plugin URL without replacing the original archive", () => {
  const original = releaseTarget("v0.1.1"), revised = releaseTarget("v0.1.1-r2");
  assert.equal(original.pluginFile,"ds-bot-0.1.1.tgz");
  assert.equal(revised.version,"0.1.1");
  assert.equal(revised.releaseTag,"v0.1.1");
  assert.equal(revised.pluginFile,"ds-bot-0.1.1-r2.tgz");
  assert.equal(revised.checksumsFile,"SHA256SUMS-r2");
  assert.equal(original.checksumsFile,"SHA256SUMS");
  assert.equal(revised.notesFile,"docs/releases/v0.1.1-r2.md");
  assert.notEqual(original.pluginFile,revised.pluginFile);
});
test("invalid revision tags cannot choose an arbitrary release or asset path", () => {
  for(const tag of ["main","v0.1.1-r0","v0.1.1-r02","v0.1.1-beta","v0.1.1-r2/../x","v0.1.1;echo x","v00.1.1"])
    assert.throws(()=>releaseTarget(tag));
});
