#!/usr/bin/env node
// 无 Docker 时运行完整源码的独立本地测试栈；只监听回环地址，不连接正式 NAS。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { initTestRoot } from './backup.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const runtime = initTestRoot(path.join(root, '.local-test'))
const env = Object.fromEntries(['PATH', 'Path', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC'].filter(k => process.env[k]).map(k => [k, process.env[k]]))
const api = spawn(process.execPath, ['server.js'], { cwd: path.join(root, 'api'), env: { ...env, HOST: '127.0.0.1', PORT: '0', DATA_DIR: path.join(runtime, 'data'),
  ORIGIN: 'http://localhost:8081', RP_ID: 'localhost', RP_NAME: 'OpenGym Personal Local Test', FIRST_USER_ADMIN: '1', ALLOW_GUEST: '1', PASSWORD_LOGIN: '0', COACH_DISABLED: '1', AUDIT_LOG: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
let web, started = false
const shutdown = () => { web?.kill(); api.kill(); process.exit() }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown)
api.stderr.on('data', () => {})
api.stdout.on('data', async chunk => {
  const m = /gym-api on :(\d+)/.exec(String(chunk))
  if (!m || started) return
  started = true
  const apiUrl = `http://127.0.0.1:${m[1]}`
  web = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '8081', '--strictPort'], {
    cwd: path.join(root, 'frontend'), env: { ...env, API_TARGET: apiUrl, API_ORIGIN: 'http://localhost:8081' }, stdio: ['ignore', 'pipe', 'pipe'] })
  web.stderr.on('data', () => {})
  web.stdout.on('data', async text => {
    if (!String(text).includes('8081')) return
    try {
      const health = await (await fetch('http://127.0.0.1:8081/api/health')).json()
      if (!health.ok) throw Error('health failed')
      fs.writeFileSync(path.join(runtime, 'local-status.json'), JSON.stringify({ web: 'http://localhost:8081', api: apiUrl, data: path.join(runtime, 'data'), synthetic: true, coachDisabled: true }, null, 2))
      console.log('OpenGym Personal 本地测试已就绪：http://localhost:8081；独立数据，AI 关闭。')
    } catch { console.error('测试栈健康检查失败'); shutdown() }
  })
  web.on('exit', code => { if (code) console.error('测试网页启动失败，8081 可能被占用'); api.kill() })
})
api.on('exit', code => { web?.kill(); if (code) console.error('独立测试 API 启动失败'); process.exitCode = code || 0 })
