import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url), ts = require('typescript');
function mount(platform: string, focused: boolean) {
  const callbacks: Array<() => boolean> = [], cleanups: Array<() => void> = [];
  let removes = 0;
  const react = {
    useRef: (current: unknown) => ({ current }),
    useEffect: (effect: () => void | (() => void)) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
    createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, props: { ...props, children } }),
  };
  const module = { exports: {} as any };
  const source = readFileSync(new URL('../src/components/EdgeBack.tsx', import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  runInNewContext(output, { module, exports: module.exports, require(name: string) {
    if (name === 'react') return react;
    if (name === 'react-native') return { Platform: { OS: platform }, View: 'View', BackHandler: { addEventListener(_name: string, callback: () => boolean) { callbacks.push(callback); return { remove() { removes++; } }; } } };
    if (name === './ScreenActivity') return { useScreenActivity: () => focused };
    throw Error(name);
  } });
  return { ...module.exports, callbacks, cleanups, removes: () => removes, source };
}

test('iOS wrapper does not install a JS pan recognizer or translate the native page', () => {
  const app = mount('ios', true);
  let calls = 0;
  app.useEdgeBack(() => calls++);
  const tree = app.EdgeBackSurface({ onBack: () => calls++, children: 'real-page' });
  assert.equal(app.callbacks.length, 0);
  assert.equal(calls, 0);
  assert.equal(tree.type, 'View');
  assert.equal(app.source.includes('PanResponder'), false);
  assert.equal(app.source.includes('translateX'), false);
});

test('only focused Android headers register back and remove their listener on blur or unmount', () => {
  const hidden = mount('android', false);
  hidden.useEdgeBack(() => assert.fail('hidden page handled back'));
  assert.equal(hidden.callbacks.length, 0);
  const app = mount('android', true);
  let calls = 0;
  app.useEdgeBack(() => calls++);
  assert.equal(app.callbacks.length, 1);
  assert.equal(app.callbacks[0](), true);
  assert.equal(calls, 1);
  app.cleanups.forEach((cleanup: () => void) => cleanup());
  assert.equal(app.removes(), 1);
});
