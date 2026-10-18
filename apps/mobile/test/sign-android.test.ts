import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, URL } from 'node:url';
import { test } from 'node:test';

const script = fileURLToPath(new URL('../scripts/sign-android.sh', import.meta.url));
const digest = 'a'.repeat(64);

// Exercise the real script with public apksigner output; no key is loaded by the stub.
for (const [name, output, accepted] of [
  ['older Build Tools signer', `Signer #1 certificate SHA-256 digest: ${digest}`, true],
  ['Build Tools 36 scheme signers', `V3.0 Signer: certificate SHA-256 digest: ${digest}\nV2 Signer: certificate SHA-256 digest: ${digest}`, true],
  ['different certificate', `V3.0 Signer: certificate SHA-256 digest: ${'0'.repeat(64)}`, false],
  ['additional foreign signer', `Signer #1 certificate SHA-256 digest: ${digest}\nSigner #2 certificate SHA-256 digest: ${'0'.repeat(64)}`, false],
  ['unrecognized certificate output', 'Verifies', false],
] as const) {
  test(`Android signing certificate check handles ${name}`, { skip: process.platform === 'win32' }, () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsbot-signing-test-'));
    try {
      const tools = join(directory, 'build-tools', '36.0.0');
      mkdirSync(tools, { recursive: true });
      writeFileSync(join(tools, 'apksigner'), '#!/usr/bin/env bash\nif [[ "$1" == "verify" ]]; then printf "%s\\n" "$TEST_CERT_OUTPUT"; fi\n', { mode: 0o755 });
      const result = spawnSync('bash', [script, 'unused-input.apk', 'unused-output.apk'], {
        encoding: 'utf8',
        env: { ...process.env, ANDROID_HOME: directory, ANDROID_KEYSTORE_PATH: 'unused-fixture-keystore', ANDROID_KEY_ALIAS: 'fixture', ANDROID_SIGNING_CERT_SHA256: digest, ANDROID_KEYSTORE_PASSWORD: 'unused-stub-password', TEST_CERT_OUTPUT: output },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, accepted ? 0 : 1, result.stderr);
      if (!accepted) assert.match(result.stderr, /certificate does not match/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
