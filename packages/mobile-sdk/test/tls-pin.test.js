import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MobileClient, MemoryTokenStore, validateTlsPin } from '../index.js';
const pin='sha256:'+'a'.repeat(64), other='sha256:'+'b'.repeat(64);
const session={serverId:'computer',deviceId:'phone',accessToken:'fixture-access',refreshToken:'fixture-refresh',expiresAt:Date.now()+3600000};
const response=value=>new Response(JSON.stringify(value));
class Socket {}
test('pin syntax and pinned transport are mandatory',()=>{
  for(const value of ['',null,'sha256:aa','sha256:'+'A'.repeat(64)])assert.throws(()=>validateTlsPin(value),{code:'invalid_tls_pin'});
  assert.equal(validateTlsPin(pin),pin);
  assert.throws(()=>new MobileClient({baseUrl:'https://example.invalid',tokenStore:new MemoryTokenStore(),tlsPin:pin}),{code:'missing_pinned_transport'});
});
test('pairing and refresh bind the QR public key to the secure credentials',async()=>{
  const store=new MemoryTokenStore();let refreshed=0;
  const client=new MobileClient({baseUrl:'https://example.invalid',tlsPin:pin,tokenStore:store,WebSocket:Socket,fetch:async url=>{
    if(url.endsWith('/info'))return response({protocolVersion:1,serverId:'computer'});
    if(url.endsWith('/auth/refresh')){refreshed++;return response(session);}
    if(url.includes('/pairings/'))return response(session);
    return response({ok:true});
  }});
  await client.info(); await client.completePairing('claim-fixture');assert.equal((await store.get()).tlsPin,pin);
  await store.set({...await store.get(),expiresAt:Date.now()-1000});await client.state();assert.equal(refreshed,1);assert.equal((await store.get()).tlsPin,pin);client.dispose();
});
test('changing the client pin or omitting it cannot send saved credentials',async()=>{
  for(const candidate of [other,undefined]) {
    let leaked=false;
    const client=new MobileClient({baseUrl:'https://example.invalid',tlsPin:candidate,tokenStore:new MemoryTokenStore({...session,tlsPin:pin}),WebSocket:Socket,fetch:async(_url,init)=>{if(init.headers.Authorization)leaked=true;return response({protocolVersion:1,serverId:'computer'});}});
    await assert.rejects(client.state(),{code:'server_changed'});assert.equal(leaked,false);client.dispose();
  }
});
