import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportsMobileAction } from '../src/logic/mobile-capabilities.ts';

test('minimal bridge disables automatic team actions despite working text send', () => {
  const capabilities = { send: true, history: true, stream: true, approvals: false, modelSelection: false, actions: [] };
  assert.equal(supportsMobileAction(capabilities, 'approvals', 'approvals'), false);
  assert.equal(supportsMobileAction(capabilities, 'efforts', 'modelSelection'), false);
  assert.equal(supportsMobileAction(capabilities, 'update-bot', 'modelSelection'), false);
});
test('explicit allowlist and feature denials are respected', () => {
  assert.equal(supportsMobileAction({ approvals:true, actions:['approvals'] }, 'approvals', 'approvals'), true);
  assert.equal(supportsMobileAction({ approvals:false, actions:['approvals'] }, 'approvals', 'approvals'), false);
  assert.equal(supportsMobileAction({ approvals:true, actions:[] }, 'approvals', 'approvals'), false);
});
test('older feature advertisement is supported but missing information fails closed', () => {
  assert.equal(supportsMobileAction({ approvals:true }, 'approvals', 'approvals'), true);
  assert.equal(supportsMobileAction(undefined, 'approvals', 'approvals'), false);
  assert.equal(supportsMobileAction({}, 'approvals', 'approvals'), false);
});
