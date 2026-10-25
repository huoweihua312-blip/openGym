#!/usr/bin/env node
// 容器启动和重启可能暂时重置连接；只对健康检查有限重试，不重放写操作。
import { setTimeout as delay } from 'node:timers/promises'
const url = new URL(process.argv[2] || 'http://127.0.0.1:8081/api/health')
if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/api/health') throw Error('仅允许本机健康检查')
let last = 'not ready'
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    const result = await response.json()
    if (response.ok && result.ok === true && result.writable === true) {
      console.log(JSON.stringify({ ok: true, writable: true, attempts: attempt + 1 }))
      process.exit(0)
    }
    last = `HTTP ${response.status}`
  } catch (error) { last = error.code || error.name }
  await delay(1000)
}
console.error(`健康检查超时：${last}`)
process.exitCode = 1
