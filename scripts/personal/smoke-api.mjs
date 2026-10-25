#!/usr/bin/env node
// 使用一次性合成账户验证真实 API 的登录、隔离、409 冲突和进程重启持久化。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { hashPassword } from '../../api/password.js'
import { boundPort } from '../../api/test/helpers.mjs'
import { installPersonalPlan, startPersonalSession, recordPersonalSet } from '../../frontend/src/lib/personal-session.js'
import { mergeStates } from '../../frontend/src/lib/sync-merge.js'
import { initTestRoot, backup, restoreTest } from './backup.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
// Windows 低完整性进程的系统 TEMP 可能无法原子重命名，合成数据固定留在项目内。
const scratch = path.join(root, '.test-tmp')
fs.mkdirSync(scratch, { recursive: true })
const dir = initTestRoot(fs.mkdtempSync(path.join(scratch, 'personal-test-smoke-')))
const data = path.join(dir, 'data'); fs.mkdirSync(data)
const password = crypto.randomBytes(24).toString('hex')
fs.writeFileSync(path.join(data, 'db.json'), JSON.stringify({ users: [{ id: 'synthetic', name: 'Synthetic', created: new Date().toISOString(), pw: { h: await hashPassword(password), set: new Date().toISOString() } }], creds: [], subs: [], invites: [] }))
let server
async function start(dataRoot = data) {
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(root, 'api'), env: { ...process.env, HOST: '127.0.0.1', PORT: '0', DATA_DIR: dataRoot,
    RP_ID: 'localhost', ORIGIN: 'http://localhost:8081', PASSWORD_LOGIN: '1', COACH_DISABLED: '1', ALLOW_GUEST: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''; child.stdout.on('data', d => { log += d }); child.stderr.on('data', d => { log += d })
  const port = await boundPort(child, () => log); server = child
  return `http://127.0.0.1:${port}`
}
async function stop() { const child = server; server = null; if (child && child.exitCode == null && child.signalCode == null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited } }
try {
  let url = await start()
  async function login() {
    const r = await fetch(url + '/api/login/password', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8081' }, body: JSON.stringify({ name: 'Synthetic', password }) })
    assert.equal(r.status, 200)
    const c = r.headers.getSetCookie().find(c => c.startsWith('gymsid=')); assert.ok(c)
    return c.split(';')[0]
  }
  let cookie = await login()
  async function put(state, rev) {
    return fetch(url + '/api/data', { method: 'PUT', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://localhost:8081' }, body: JSON.stringify({ state, baseRev: rev }) })
  }
  const read = async () => (await fetch(url + '/api/data', { headers: { Cookie: cookie } })).json()
  const s = { unit: 'kg', routines: [], workouts: [], bodyweight: [], exWeights: {}, week: {}, dayPlan: {} }
  const today = '2026-10-25'; installPersonalPlan(s, { id: 'synthetic-cycle', today, now: 1 }); startPersonalSession(s, today, 2)
  assert.equal((await put(s, 0)).status, 200)
  const first = await read(), phone = structuredClone(first.state), tablet = structuredClone(first.state)
  recordPersonalSet(phone, 'synthetic-cycle', 0, 1, 'both', { done: true }, 10, today)
  recordPersonalSet(tablet, 'synthetic-cycle', 0, 2, 'both', { done: true }, 11, today)
  assert.equal((await put(phone, first.rev)).status, 200)
  const conflict = await put(tablet, first.rev); assert.equal(conflict.status, 409)
  const current = await conflict.json(), merged = mergeStates(tablet, current.state)
  assert.equal((await put(merged, current.rev)).status, 200)
  assert.equal((await fetch(url + '/api/data')).status, 401)
  await stop(); url = await start()
  const persisted = await read(); assert.equal(Object.keys(persisted.state.personalSets).length, 2)
  await stop()
  const archive = path.join(path.dirname(dir), path.basename(dir) + '-backup')
  const saved = backup(dir, archive)
  const restored = path.join(path.dirname(dir), path.basename(dir) + '-restored')
  restoreTest(archive, restored)
  assert.equal(fs.readFileSync(path.join(restored, 'data', 'state-synthetic.json'), 'utf8'), fs.readFileSync(path.join(data, 'state-synthetic.json'), 'utf8'))
  url = await start(path.join(restored, 'data'))
  const restoredState = await read(); assert.equal(Object.keys(restoredState.state.personalSets).length, 2)
  console.log(JSON.stringify({ ok: true, login: true, unauthorizedDenied: true, conflict409: true, groupMerge: true, restartPersistence: true, backupRestore: true, restoredAuthentication: true, files: saved.files, synthetic: true }))
} finally { await stop() }
