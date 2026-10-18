import test from 'node:test';
import assert from 'node:assert/strict';
import { createHomeScrollRestoration } from '../src/logic/home-scroll.ts';

test('native scrolling records position without changing the contentOffset prop', () => {
  const state=createHomeScrollRestoration();
  const original=state.initialOffset;
  for(let y=0;y<=2000;y+=5){state.observe(y);assert.equal(state.initialOffset,original);assert.equal(state.initialOffset.y,0);}
  assert.deepEqual(state.restore(),{x:0,y:2000});
});
test('return restores once while subsequent drag and momentum keep the restored object stable',()=>{
  const state=createHomeScrollRestoration();state.observe(500);const restored=state.restore();
  for(const y of [520,580,610,612,611]){state.observe(y);assert.equal(state.initialOffset,restored);assert.equal(restored.y,500);}
  assert.deepEqual(state.restore(),{x:0,y:611});
});
test('invalid and bounce offsets cannot poison restoration; a new host resets it',()=>{
  const state=createHomeScrollRestoration();state.observe(100);state.observe(NaN);state.observe(Infinity);assert.equal(state.restore().y,100);
  state.observe(-40);assert.equal(state.restore().y,0);state.observe(900);state.reset();assert.deepEqual(state.initialOffset,{x:0,y:0});assert.equal(state.restore().y,0);
});
