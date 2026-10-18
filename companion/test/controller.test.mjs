import test from 'node:test'
import assert from 'node:assert/strict'
import { createDeviceController } from '../src/controller.mjs'
import { createOperatorClient } from '../src/operator-client.mjs'
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const ready = { enabled: true, pending: [{ requestId: 'request-one', deviceName: 'Example phone' }], devices: [{ id: 'device-one', name: 'Old phone' }] }

test('closing the page discards an in-flight pairing response', async () => {
  const pending = deferred()
  const c = createDeviceController({ call: method => method === 'pairing.create' ? pending.promise : Promise.resolve(ready), now: () => 10 })
  const run = c.create(); c.clearPairing()
  pending.resolve({ url: 'https://phone.example', code: 'example', serverId: 'example-server', expiresAt: 100 })
  await run; assert.equal(c.snapshot().pairing, null); assert.equal(c.snapshot().busy, false)
})
test('QR credentials expire and are never retained after disposal', async () => {
  let time = 10
  const c = createDeviceController({ call: async method => method === 'pairing.create' ? { url: 'https://phone.example', code: 'example', serverId: 'example-server', expiresAt: 100 } : ready, now: () => time })
  await c.create(); assert.equal(c.snapshot().pairing.code, 'example')
  time = 101; c.tick(); assert.equal(c.snapshot().pairing, null)
  c.dispose(); assert.equal(c.snapshot().status, null)
})
test('approval is explicit and revocation requires the selected confirmation', async () => {
  const calls = []
  const c = createDeviceController({ call: async (method, payload) => { calls.push([method,payload]); return ready } })
  await c.refresh(); await c.revoke('device-one'); await c.decide('unknown',true)
  assert.equal(calls.length,1)
  await c.decide('request-one',true); assert.deepEqual(calls[1],['pairing.approve',{requestId:'request-one'}])
  c.confirmRevoke('device-one'); await c.revoke('device-one')
  assert.ok(calls.some(([method,payload]) => method === 'device.revoke' && payload.id === 'device-one'))
})
test('disabled or unavailable bridge removes the displayed pairing', async () => {
  let available = true
  const c = createDeviceController({ call: async method => method === 'pairing.create' ? { url: 'https://phone.example', code: 'example', serverId: 'example-server', expiresAt: Date.now()+1000 } : available ? ready : { enabled:false } })
  await c.create(); available=false; await c.refresh(); assert.equal(c.snapshot().pairing,null)
})
test('owner client preserves same-origin carrier and refuses mismatched RPC responses', async () => {
  let sent
  const client = createOperatorClient({ root:'dsh-app://app/', location:new URL('dsh-app://app/'), uuid:()=> 'request-one', fetchImpl:async (url,init) => { sent={url:String(url),init};return {ok:true,json:async()=>({type:'server-response',rpcId:'request-one',result:{ok:true,value:ready}})} } })
  assert.deepEqual(await client('status'),ready); assert.equal(sent.url,'dsh-app://app/mobile-operator/status');assert.equal(sent.init.credentials,'same-origin')
  assert.throws(()=>createOperatorClient({root:'https://other.example/',location:new URL('https://host.example/')}))
  const bad=createOperatorClient({root:'https://host.example/',location:undefined,uuid:()=> 'one',fetchImpl:async()=>({ok:true,json:async()=>({type:'server-response',rpcId:'other',result:{ok:true,value:ready}})})})
  await assert.rejects(bad('status'))
})
test('missing Bridge yields actionable setup error and no privileged fallback', async () => {
  for (const status of [404, 405]) {
    const call=createOperatorClient({root:'https://host.example/',location:undefined,fetchImpl:async()=>({ok:false,status})})
    await assert.rejects(call('status'),error=>error.code===`HTTP_${status}` && error.message.includes('Install and configure'))
    await assert.rejects(call('unknown'))
  }
})
test('slow status requests are shared by polls and their responses can still render', async () => {
  const pending = deferred(); let calls = 0
  const c = createDeviceController({ call: () => { calls++; return pending.promise } })
  const first = c.refresh(), polls = Array.from({ length: 5 }, () => c.refresh())
  assert.equal(calls, 1)
  pending.resolve(ready)
  await Promise.all([first, ...polls])
  assert.equal(c.snapshot().status, ready)
  assert.equal(calls, 1)
  c.dispose()
})
test('a completed mutation gets a fresh status after an older in-flight poll', async () => {
  const old = deferred(), fresh = deferred(), mutation = deferred(); let statusCalls = 0
  const c = createDeviceController({ now: () => 10, call: method => method === 'status' ? (++statusCalls === 1 ? old.promise : fresh.promise) : mutation.promise })
  const poll = c.refresh(), create = c.create()
  mutation.resolve({ url: 'https://phone.example', code: 'example', serverId: 'example-server', expiresAt: 100 })
  await Promise.resolve(); await Promise.resolve()
  old.resolve({ enabled: false })
  await poll; await Promise.resolve()
  assert.equal(statusCalls, 2)
  assert.equal(c.snapshot().status, null)
  assert.ok(c.snapshot().pairing)
  fresh.resolve(ready)
  await create
  assert.equal(c.snapshot().status, ready)
  assert.equal(c.snapshot().busy, false)
  c.dispose()
})
