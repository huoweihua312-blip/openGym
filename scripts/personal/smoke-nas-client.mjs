#!/usr/bin/env node
// 在本机合成实例验证 NAS 交付客户端的注册、完整循环、重启与再登录流程。
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { boundPort } from '../../api/test/helpers.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tmp = path.join(root, '.test-tmp'); fs.mkdirSync(tmp, { recursive: true })
const dir = fs.mkdtempSync(path.join(tmp, 'personal-nas-client-'))
const gate = path.join(dir, 'evidence')
let server, client
async function start(port = 0) {
  let log = ''
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(root, 'api'), env: { ...process.env,
    HOST: '127.0.0.1', PORT: String(port), DATA_DIR: path.join(dir, 'data'), RP_ID: 'localhost', ORIGIN: 'http://localhost:18081',
    PASSWORD_LOGIN: '1', ALLOW_GUEST: '0', COACH_DISABLED: '1', FIRST_USER_ADMIN: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', d => { log += d }); child.stderr.on('data', d => { log += d }); server = child
  return boundPort(child, () => log)
}
async function stop() {
  const child = server; server = null
  if (child && child.exitCode == null && child.signalCode == null) { const done = new Promise(r => child.once('exit', r)); child.kill(); await done }
}
try {
  const port = await start()
  client = spawn(process.execPath, ['scripts/personal/nas-acceptance.mjs', `http://127.0.0.1:${port}`, gate], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''; client.stdout.on('data', d => { output += d }); client.stderr.on('data', d => { output += d })
  const done = new Promise(resolve => client.once('exit', resolve))
  for (let i = 0; !fs.existsSync(path.join(gate, 'ready')); i++) {
    if (client.exitCode != null || i >= 200) throw Error('合成客户端失败：' + output)
    await delay(100)
  }
  await stop(); await start(port)
  fs.writeFileSync(path.join(gate, 'restarted'), 'synthetic process restarted\n', { flag: 'wx' })
  const code = await done
  if (code !== 0) throw Error(output)
  console.log(fs.readFileSync(path.join(gate, 'result.json'), 'utf8'))
} finally { client?.kill(); await stop() }
