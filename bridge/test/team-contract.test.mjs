import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createTeamContract } from '../src/team-contract.mjs'

const botState = () => ({ bots: [{ id: 'bot-1', sessionId: 'chat-1' }], rooms: [] })
const roomState = () => ({ bots: [{ id: 'bot-1', sessionId: 'chat-1' }, { id: 'bot-2', sessionId: 'chat-2' }], rooms: [{ id: 'room-1', sessionId: 'room-session-1', members: ['bot-1', 'bot-2'] }] })
const botBody = extra => ({ conversationId: 'bot-1', expectedSessionId: 'chat-1', ...extra })
const roomBody = extra => ({ conversationId: 'room-1', expectedSessionId: 'room-1', expectedMembers: ['bot-1', 'bot-2'], ...extra })
const validSubmit = extra => ({ version: 1, requestId: 'device:request-1', content: [{ type: 'text', text: 'hello' }], ...extra })

async function fixture(t, { state = botState(), accepted = { accepted: true }, promptError, stateError } = {}) {
  const dsBotHome = await mkdtemp(join(tmpdir(), 'ds-bot-team-contract-'))
  t.after(() => rm(dsBotHome, { recursive: true, force: true }))
  const calls = [], prompts = []
  const contract = createTeamContract({
    dsBotHome,
    prompt: async request => { prompts.push(request); if (promptError) throw promptError; return accepted },
    callTeam: async (endpoint, payload, signal) => {
      calls.push({ endpoint, payload, signal })
      if (endpoint === 'state') {
        if (stateError) throw stateError
        return { ok: true, value: state }
      }
      throw new Error(`Unexpected endpoint: ${endpoint}`)
    },
  })
  return { contract, calls, prompts, dsBotHome }
}

test('describe returns the exact in-process contract capabilities', async t => {
  const { contract } = await fixture(t)
  assert.deepEqual(contract.describe(), { version: 1, stableRequestId: true, redactedText: true, groups: true, groupProjection: 1, attachments: false })
})

test('redact masks current DS Bot secret values from its files on each call', async t => {
  const { contract, dsBotHome } = await fixture(t)
  await writeFile(join(dsBotHome, 'secrets.json'), JSON.stringify({ version: 1, secrets: [{ name: 'FIXTURE_TOKEN', value: 'synthetic-long-token-value' }] }))
  const result = await contract.redact(botBody({ texts: ['token=synthetic-long-token-value'] }))
  assert.deepEqual(result, { texts: ['token=[secret:FIXTURE_TOKEN]'] })
})

test('redact returns text unchanged when secrets.json does not exist', async t => {
  const { contract } = await fixture(t)
  assert.deepEqual(await contract.redact(botBody({ texts: ['nothing to redact'] })), { texts: ['nothing to redact'] })
})

test('redact rereads secrets.json for every call', async t => {
  const { contract, dsBotHome } = await fixture(t)
  const path = join(dsBotHome, 'secrets.json')
  await writeFile(path, JSON.stringify({ version: 1, secrets: [{ name: 'FIRST', value: 'synthetic-first-value' }] }))
  assert.deepEqual(await contract.redact(botBody({ texts: ['synthetic-first-value'] })), { texts: ['[secret:FIRST]'] })
  await writeFile(path, JSON.stringify({ version: 1, secrets: [{ name: 'SECOND', value: 'synthetic-second-value' }] }))
  assert.deepEqual(await contract.redact(botBody({ texts: ['synthetic-second-value'] })), { texts: ['[secret:SECOND]'] })
})

test('redact fails closed when an existing secrets file cannot be parsed', async t => {
  const { contract, dsBotHome } = await fixture(t)
  await writeFile(join(dsBotHome, 'secrets.json'), '{not-json')
  await assert.rejects(contract.redact(botBody({ texts: ['synthetic-long-token-value'] })), { code: 'bot/unavailable' })
})

test('redact fails closed when secrets.json cannot be read as a file', async t => {
  const { contract, dsBotHome } = await fixture(t)
  await mkdir(join(dsBotHome, 'secrets.json'))
  await assert.rejects(contract.redact(botBody({ texts: ['synthetic-sensitive-text'] })), { code: 'bot/unavailable' })
})

test('redact bounds the batch before requesting team state', async t => {
  const { contract, calls } = await fixture(t)
  await assert.rejects(contract.redact(botBody({ texts: Array(201).fill('x') })), { code: 'bot/invalid' })
  assert.deepEqual(calls, [])
})

test('redact rejects a stale Bot Session', async t => {
  const { contract } = await fixture(t)
  await assert.rejects(contract.redact(botBody({ expectedSessionId: 'old-session', texts: ['text'] })), { code: 'bot/stale' })
})

test('redact rejects a changed group member list', async t => {
  const { contract } = await fixture(t, { state: roomState() })
  await assert.rejects(contract.redact(roomBody({ expectedMembers: ['bot-1'], texts: ['text'] })), { code: 'bot/stale' })
})

test('redact rejects unavailable state instead of returning unredacted text', async t => {
  const { contract } = await fixture(t, { stateError: new Error('synthetic state failure') })
  await assert.rejects(contract.redact(botBody({ texts: ['synthetic-sensitive-text'] })), { code: 'bot/unavailable' })
})

test('submit reads state then prompts the verified Bot Session with the device request ID', async t => {
  const { contract, calls, prompts } = await fixture(t)
  const result = await contract.submit(validSubmit(botBody()))
  assert.deepEqual(result, { accepted: true, requestId: 'device:request-1', sessionId: 'chat-1' })
  assert.deepEqual(calls.map(item => item.endpoint), ['state'])
  assert.deepEqual(prompts, [{ requestId: 'device:request-1', sessionId: 'chat-1', mode: 'queue', content: [{ type: 'text', text: 'hello' }] }])
})

test('submit refuses a read-only team without prompting', async t => {
  const { contract, prompts } = await fixture(t, { state: { ...botState(), readOnly: 'Held by another computer' } })
  await assert.rejects(contract.submit(validSubmit(botBody())), { code: 'bot/read-only' })
  assert.equal(prompts.length, 0)
})

test('submit maps prompt failures and unconfirmed admission to bot/unconfirmed', async t => {
  for (const options of [{ promptError: new Error('synthetic transport failure') }, { accepted: { accepted: false } }]) {
    const { contract } = await fixture(t, options)
    await assert.rejects(contract.submit(validSubmit(botBody())), { code: 'bot/unconfirmed' })
  }
})

test('submit prompts the public room Session after membership verification', async t => {
  const { contract, prompts } = await fixture(t, { state: roomState() })
  const result = await contract.submit(validSubmit(roomBody({ requestId: 'room_request' })))
  assert.deepEqual(result, { accepted: true, requestId: 'room_request', sessionId: 'room-1' })
  assert.deepEqual(prompts.map(item => [item.requestId, item.sessionId]), [['room_request', 'room-session-1']])
})

test('submit rejects a group whose member Bot no longer exists in team state', async t => {
  const state = { ...roomState(), bots: [{ id: 'bot-1', sessionId: 'chat-1' }] }
  const { contract, calls } = await fixture(t, { state })
  await assert.rejects(contract.submit(validSubmit(roomBody())), { code: 'bot/stale' })
  assert.deepEqual(calls.map(item => item.endpoint), ['state'])
})

test('submit rejects invalid IDs, empty content and Session references without dispatching', async t => {
  const { contract, calls } = await fixture(t)
  for (const body of [
    validSubmit(botBody({ requestId: 'invalid id' })),
    validSubmit(botBody({ content: [{ type: 'text', text: '   ' }] })),
    validSubmit(botBody({ content: [{ type: 'text', text: 'dsh-session:private' }] })),
  ]) await assert.rejects(contract.submit(body), { code: 'bot/invalid' })
  assert.deepEqual(calls, [])
})

test('redactor source contains no runtime secret value after use', async t => {
  const { contract, dsBotHome } = await fixture(t)
  await writeFile(join(dsBotHome, 'secrets.json'), JSON.stringify({ version: 1, secrets: [{ name: 'FIXTURE_TOKEN', value: 'synthetic-long-token-value' }] }))
  await contract.redact(botBody({ texts: ['synthetic-long-token-value'] }))
  const source = await readFile(new URL('../src/team-contract.mjs', import.meta.url), 'utf8')
  assert.equal(source.includes('synthetic-long-token-value'), false)
})
