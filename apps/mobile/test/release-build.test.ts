import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const { unsignedRelease } = require('../plugins/withReleaseBuild.cjs');
const template = `android {
  signingConfigs { debug { keyAlias 'androiddebugkey' } }
  buildTypes {
    debug { signingConfig signingConfigs.debug }
    release {
      signingConfig signingConfigs.debug
      minifyEnabled false
    }
  }
}`;

test('release generation preserves development signing but cannot ship the public debug identity', () => {
  const output = unsignedRelease(template);
  assert.match(output, /debug \{ signingConfig signingConfigs.debug \}/);
  assert.match(output, /release \{\s+signingConfig null/);
  assert.match(output, /minifyEnabled false/);
  assert.equal(unsignedRelease(output), output);
});

test('an unfamiliar release template fails closed instead of retaining debug signing', () => {
  assert.throws(() => unsignedRelease('android { buildTypes { release { } } }'), /template changed/);
});
