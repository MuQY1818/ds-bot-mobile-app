import test from 'node:test'
import assert from 'node:assert/strict'
import { createAdapter } from '../src/adapter.mjs'
test('real candidate adapter carries avatars through both state and conversations', async () => {
  const fixture = { revision:1, rooms:[], models:[], mainBotIds:['fixture-chief'], bots:[
    {id:'fixture-chief',sessionId:'fixture-chief-chat',name:'Fixture Chief',color:'deepseek',avatar:{shape:'whale',path:'/private'},instructions:'private'},
    {id:'fixture-cat',sessionId:'fixture-cat-chat',name:'Fixture Cat',color:'yellow',avatar:{shape:'kitty',image:'file:///private/photo.png'},workDir:'/private'},
    {id:'fixture-default',sessionId:'fixture-default-chat',name:'Fixture Default'},
  ] }
  const connection = { createSharedFetchHandler: () => ({ fetch: async request => {
    const {endpoint} = await request.json()
    return Response.json({ok:true,value:endpoint === 'state' ? fixture : {version:1}})
  } }) }
  const adapter = createAdapter({connection})
  await adapter.initialize()
  const state = await adapter.state()
  const list = await adapter.conversations()
  assert.deepEqual(state.bots[0].avatar,{shape:'whale'})
  assert.deepEqual(state.bots[1].avatar,{shape:'kitty'})
  assert.equal(state.bots[1].color,'yellow')
  assert.equal(state.bots[2].id,'fixture-default')
  assert.equal(state.bots[2].avatar,undefined)
  assert.deepEqual(list.conversations,state.bots)
  assert.ok(!JSON.stringify(state).includes('/private'))
  assert.ok(!JSON.stringify(state).includes('instructions'))
})
