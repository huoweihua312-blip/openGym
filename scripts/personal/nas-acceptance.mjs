#!/usr/bin/env node
// 仅供全新隔离测试实例；合成 Cookie/密码仅留内存，不写入证据或日志。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { installPersonalPlan, startPersonalSession, personalSession, recordPersonalSet, finishPersonalSession } from '../../frontend/src/lib/personal-session.js'
import { cycleView, nextDay, advanceCycle } from '../../api/personal/cycle.js'

const [url, gate] = process.argv.slice(2)
if (!/^http:\/\/(api:3000|127\.0\.0\.1:\d+|localhost:\d+)$/.test(url || '') || !gate) throw Error('仅允许隔离 Docker 网络或本机端口')
fs.mkdirSync(gate, { recursive: true, mode: 0o700 })
if (fs.existsSync(path.join(gate, 'ready')) || fs.existsSync(path.join(gate, 'restarted'))) throw Error('证据目录已使用，请使用全新目录')
const origin = 'http://localhost:18081'
let cookie = ''
async function request(route, method = 'GET', body) {
  return fetch(url + route, { method, signal: AbortSignal.timeout(5000), headers: {
    Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) })
}
let health
for (let i = 0; i < 30; i++) {
  try { const r = await request('/api/health'); if (r.ok) { health = await r.json(); break } } catch {}
  await delay(1000)
}
assert.ok(health, '隔离 API 启动超时')
assert.equal(health.ok, true); assert.equal(health.users, 0, '仅允许全新测试数据，拒绝已有用户的实例')
const config = await (await request('/api/config')).json()
assert.equal(config.password_login, true); assert.equal(config.allow_guest, false)
assert.equal((await request('/api/data')).status, 401)
const name = 'SyntheticNAS-' + crypto.randomBytes(4).toString('hex')
const password = crypto.randomBytes(24).toString('base64url')
const registered = await request('/api/register/password', 'POST', { name, password })
assert.equal(registered.status, 200, '合成账户注册失败')
function takeCookie(response) {
  const value = response.headers.getSetCookie().find(c => c.startsWith('gymsid='))
  assert.ok(value); cookie = value.split(';')[0]
}
takeCookie(registered)
const today = new Date().toISOString().slice(0, 10)
const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 7)
const day = d.toISOString().slice(0, 10)
const S = { unit: 'kg', routines: [], workouts: [], bodyweight: [], exWeights: {}, week: {}, dayPlan: {} }
let now = Date.now()
installPersonalPlan(S, { id: 'nas-synthetic-cycle', today: day, now: now++ })
for (let phase = 0; phase < 3; phase++) {
  const key = startPersonalSession(S, day, now++)
  const session = personalSession(S, key)
  for (const [ei, e] of session.entries.entries()) for (const [si, row] of e.sets.entries()) {
    for (const side of row.sides ? ['L', 'R'] : ['both']) recordPersonalSet(S, key, ei, si, side, { done: true, rir: 2, quality: 'good' }, now++, today)
  }
  finishPersonalSession(S, { eventId: 'nas-complete-' + phase, today, day, now: now++ })
}
assert.equal(cycleView(S, day).step, 'Rest')
assert.equal(cycleView(S, day).waiting, true)
assert.throws(() => advanceCycle(S, { id: 'nas-too-early', today: day, day, at: now++ }))
advanceCycle(S, { id: 'nas-rest', today, day: nextDay(day), at: now++ })
assert.equal(cycleView(S, today).step, 'Push')
const existing = await (await request('/api/data')).json()
const saved = await request('/api/data', 'PUT', { state: S, baseRev: existing.rev || 0 })
assert.equal(saved.status, 200)
assert.equal((await request('/api/data', 'PUT', { state: S, baseRev: existing.rev || 0 })).status, 409)
fs.writeFileSync(path.join(gate, 'ready'), 'synthetic state saved; ready for isolated restart\n', { flag: 'wx', mode: 0o600 })
console.log('合成账户、完整三练一休和 409 保护通过；等待仅测试容器重启。')
for (let i = 0; !fs.existsSync(path.join(gate, 'restarted')); i++) {
  if (i >= 180) throw Error('等待测试重启超时')
  await delay(1000)
}
let resumed
for (let i = 0; i < 30; i++) {
  try { const response = await request('/api/data'); if (response.ok) { resumed = await response.json(); break } } catch {}
  await delay(1000)
}
assert.ok(resumed, '重启后原认证未恢复')
assert.equal(resumed.state.workouts.length, 3)
assert.equal(Object.keys(resumed.state.personalEvents).length, 4)
assert.equal(cycleView(resumed.state, today).step, 'Push')
cookie = ''
const relogin = await request('/api/login/password', 'POST', { name, password })
assert.equal(relogin.status, 200); takeCookie(relogin)
assert.equal((await request('/api/data')).status, 200)
const result = { ok: true, syntheticOnly: true, registration: true, login: true, unauthorized401: true,
  conflict409: true, completePushPullShoulderRest: true, earlyRestDenied: true,
  restartPersistence: true, originalSessionSurvives: true, reloginAfterRestart: true, workouts: 3, events: 4 }
fs.writeFileSync(path.join(gate, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 })
console.log(JSON.stringify(result))
