import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { initTestRoot, backup, verify, restoreTest, assertTestRoot } from '../../../scripts/personal/backup.mjs'
describe('隔离备份恢复', () => {
  function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-test-'))
    const source = initTestRoot(path.join(dir, 'opengym-dev'))
    fs.mkdirSync(path.join(source, 'data'))
    fs.writeFileSync(path.join(source, 'data', 'db.json'), '{"users":[]}')
    fs.writeFileSync(path.join(source, 'data', 'secret'), 'synthetic-test-only')
    fs.mkdirSync(path.join(source, 'coach-auth'))
    fs.writeFileSync(path.join(source, 'coach-auth', 'fixture.json'), '{"synthetic":true}')
    return { dir, source, archive: path.join(dir, 'private-backup') }
  }
  it('完整保存认证、训练和 provider auth 状态并校验', () => {
    const f = fixture(); backup(f.source, f.archive)
    expect(verify(f.archive).files.map(e => e.path)).toEqual(['coach-auth/fixture.json', 'data/db.json', 'data/secret'])
    const restored = path.join(f.dir, 'personal-test-restored'); restoreTest(f.archive, restored)
    expect(fs.readFileSync(path.join(restored, 'data', 'secret'), 'utf8')).toBe('synthetic-test-only')
    expect(fs.readFileSync(path.join(restored, 'data', 'db.json'), 'utf8')).toBe('{"users":[]}')
  })
  it('篡改的备份拒绝恢复', () => {
    const f = fixture(); backup(f.source, f.archive)
    fs.writeFileSync(path.join(f.archive, 'data', 'db.json'), 'tampered')
    expect(() => restoreTest(f.archive, path.join(f.dir, 'personal-test-restore'))).toThrow(/校验/)
  })
  it('正式目录和非空目标永不被测试恢复覆盖', () => {
    const f = fixture(); backup(f.source, f.archive)
    expect(() => assertTestRoot('/vol1/1000/opengym')).toThrow(/正式/)
    expect(() => restoreTest(f.archive, f.source)).toThrow(/非空/)
    expect(fs.readFileSync(path.join(f.source, 'data', 'secret'), 'utf8')).toBe('synthetic-test-only')
  })
  it('不覆盖已有备份、不把备份放在源数据内', () => {
    const f = fixture(); backup(f.source, f.archive)
    expect(() => backup(f.source, f.archive)).toThrow(/存在/)
    expect(() => backup(f.source, path.join(f.source, 'backup'))).toThrow(/源数据/)
  })
  it('缺少 secret 的备份不能验证为完整备份', () => {
    const f = fixture(); fs.renameSync(path.join(f.source, 'data', 'secret'), path.join(f.dir, 'secret-held'))
    expect(() => backup(f.source, f.archive)).toThrow(/认证/)
  })
  it('清单中的目录穿越不能逃出备份目录', () => {
    const f = fixture(); backup(f.source, f.archive)
    const p = path.join(f.archive, 'manifest.json'), m = JSON.parse(fs.readFileSync(p))
    m.files[0].path = '../outside'; fs.writeFileSync(p, JSON.stringify(m))
    expect(() => verify(f.archive)).toThrow(/越界/)
  })
})
