#!/usr/bin/env node
// 完整文件备份与隔离恢复；从不删除、覆盖正式数据，也不输出文件内容。
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
const MARKER = '.opengym-personal-test'
const sensitive = ['data', 'coach-auth', '.env']
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const inside = (root, p) => { const rel = path.relative(root, p); return rel !== '' && !rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel) }
export function assertTestRoot(root) {
  const resolved = path.resolve(root)
  if (!/^opengym-dev$|^\.local-test$|^personal-test-[A-Za-z0-9_-]+$/.test(path.basename(resolved))) throw Error('测试目录必须名为 opengym-dev、.local-test 或 personal-test-*，拒绝正式目录')
  let part = resolved
  while (part !== path.dirname(part)) {
    if (fs.existsSync(part) && fs.lstatSync(part).isSymbolicLink()) throw Error('目录链中有符号链接，拒绝恢复或部署')
    part = path.dirname(part)
  }
  return resolved
}
export function initTestRoot(root) {
  const dir = assertTestRoot(root)
  const marked = fs.existsSync(path.join(dir, MARKER)) && !fs.lstatSync(path.join(dir, MARKER)).isSymbolicLink()
  if (fs.existsSync(dir) && !marked && fs.readdirSync(dir).some(n => n !== MARKER)) throw Error('目标非空，拒绝初始化')
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  if (!fs.existsSync(path.join(dir, MARKER))) fs.writeFileSync(path.join(dir, MARKER), 'OpenGym Personal isolated test data\n', { flag: 'wx', mode: 0o600 })
  return dir
}
function files(root, rel = '') {
  const out = []
  for (const name of fs.readdirSync(path.join(root, rel)).sort()) {
    const r = path.join(rel, name), stat = fs.lstatSync(path.join(root, r))
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw Error('备份中存在链接或特殊文件')
    if (stat.isDirectory()) out.push(...files(root, r))
    else out.push(r.replaceAll('\\', '/'))
  }
  return out
}
function sourceFiles(root) {
  return sensitive.filter(x => fs.existsSync(path.join(root, x))).flatMap(x => {
    const stat = fs.lstatSync(path.join(root, x))
    if (stat.isSymbolicLink()) throw Error('源状态中存在符号链接，拒绝跨目录备份')
    return stat.isDirectory() ? files(root, x) : [x]
  }).sort()
}
export function backup(root, dest, { productionApproved = false } = {}) {
  const source = path.resolve(root), target = path.resolve(dest)
  if (!productionApproved && !fs.existsSync(path.join(assertTestRoot(source), MARKER))) throw Error('源目录没有隔离测试标记；正式备份须明确批准')
  if (inside(source, target) || source === target) throw Error('备份不能放在源数据目录内')
  if (fs.existsSync(target)) throw Error('备份目标已经存在，拒绝覆盖')
  const names = sourceFiles(source)
  if (!names.length) throw Error('源目录没有可备份状态')
  const before = names.map(p => ({ path: p, bytes: fs.statSync(path.join(source, p)).size, sha256: sha(path.join(source, p)) }))
  fs.mkdirSync(target, { recursive: true, mode: 0o700 })
  for (const e of before) {
    const file = path.join(target, e.path)
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
    fs.copyFileSync(path.join(source, e.path), file, fs.constants.COPYFILE_EXCL)
    if (process.platform !== 'win32') fs.chmodSync(file, 0o600)
  }
  if (JSON.stringify(sourceFiles(source)) !== JSON.stringify(names) || before.some(e => sha(path.join(source, e.path)) !== e.sha256)) throw Error('备份期间源文件变化；本次备份未完成，请在停止写入后重试到新目录')
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), files: before }, null, 2), { flag: 'wx', mode: 0o600 })
  verify(target)
  return { path: target, files: before.length }
}
export function verify(root) {
  const dir = path.resolve(root)
  const actualFiles = files(dir).sort()
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  if (m.version !== 1 || !Array.isArray(m.files) || !m.files.length) throw Error('备份清单无效')
  for (const e of m.files) {
    const target = path.resolve(dir, e.path)
    if (!inside(dir, target) || !/^data\/|^coach-auth\/|^\.env$/.test(e.path) || !/^[a-f0-9]{64}$/.test(e.sha256)) throw Error('备份清单有越界或不允许路径')
    if (fs.lstatSync(target).isSymbolicLink() || fs.statSync(target).size !== e.bytes || sha(target) !== e.sha256) throw Error('备份校验失败')
  }
  const expected = [...m.files.map(e => e.path), 'manifest.json'].sort()
  if (JSON.stringify(actualFiles) !== JSON.stringify(expected)) throw Error('备份包含清单外文件或有缺失')
  if (m.files.some(e => e.path === 'data/db.json') && !m.files.some(e => e.path === 'data/secret')) throw Error('缺少认证 secret，不能称为完整备份')
  return m
}
export function restoreTest(archive, root) {
  const m = verify(archive), target = assertTestRoot(root)
  if (fs.existsSync(target) && fs.readdirSync(target).some(n => n !== MARKER)) throw Error('测试恢复目标非空，拒绝覆盖')
  initTestRoot(target)
  for (const e of m.files) {
    const dest = path.join(target, e.path)
    fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 })
    fs.copyFileSync(path.join(archive, e.path), dest, fs.constants.COPYFILE_EXCL)
    if (process.platform !== 'win32') fs.chmodSync(dest, 0o600)
  }
  return { path: target, files: m.files.length }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [op, root, dest, approval] = process.argv.slice(2)
    if (!root) throw Error('用法：backup.mjs init-test ROOT | backup ROOT DEST [--production-approved] | verify BACKUP | restore-test BACKUP NEW_ROOT')
    const r = op === 'init-test' ? { path: initTestRoot(root) } : op === 'backup' ? backup(root, dest, { productionApproved: approval === '--production-approved' }) : op === 'verify' ? { files: verify(root).files.length } : op === 'restore-test' ? restoreTest(root, dest) : null
    if (!r) throw Error('未知操作')
    console.log(JSON.stringify(r))
  } catch (e) { console.error(e.message); process.exitCode = 1 }
}
