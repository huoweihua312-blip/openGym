// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { installPersonalPlan } from '../lib/personal-session.js'
import { cycleView } from '../../../api/personal/cycle.js'
import { todayISO } from '../lib/format.js'
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const mock = vi.hoisted(() => ({ S: null, nav: vi.fn(), rest: vi.fn(), search: '' }))
vi.mock('../store/useStore.js', () => ({ useStore: select => select({ S: mock.S, update: fn => { const s = structuredClone(mock.S); fn(s); mock.S = s } }) }))
vi.mock('../store/useUI.js', () => ({ useUI: { getState: () => ({ startRest: mock.rest }) } }))
vi.mock('react-router-dom', () => ({ useNavigate: () => mock.nav, useLocation: () => ({ search: mock.search }) }))
vi.mock('../lib/clipboard.js', () => ({ copyText: vi.fn(async () => {}) }))
import Personal from './Personal.jsx'
let host, root
const render = async () => { await act(async () => root.render(<Personal />)) }
const click = async text => {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === text)
  expect(button, text).toBeTruthy()
  await act(async () => button.click()); await render()
}
beforeEach(() => {
  mock.S = { unit: 'kg', workouts: [], routines: [], week: {}, dayPlan: {}, restSec: 90 }; mock.search = ''; mock.nav.mockReset(); mock.rest.mockReset()
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove() })
describe('个人手机训练集成', () => {
  it('局域网 HTTP 缺少 randomUUID 时仍可创建个人计划', async () => {
    vi.stubGlobal('crypto', { randomUUID: undefined })
    try {
      await render(); await click('创建个人训练计划')
      expect(mock.S.personalCycle?.id).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(mock.S.routines).toHaveLength(3)
    } finally { vi.unstubAllGlobals() }
  })
  it('创建计划只增添三个训练日，不删除已有记录', async () => {
    mock.S.workouts = [{ id: 'legacy' }]
    await render(); await click('创建个人训练计划')
    expect(mock.S.routines).toHaveLength(3); expect(mock.S.workouts[0].id).toBe('legacy')
    expect(host.querySelector('[aria-current=step]').textContent).toContain('Push')
  })
  it('记录一组后暂停和恢复，进度及倒计时来自持久化记录', async () => {
    installPersonalPlan(mock.S, { id: 'cycle', today: todayISO(), now: Date.now() })
    await render(); await click('开始 / 补录本阶段训练')
    await act(async () => host.querySelector('[aria-label="1-both-完成本组"]').click()); await render()
    expect(mock.rest).toHaveBeenCalledWith(90, 0)
    expect(host.querySelector('[role=timer]').textContent).toContain('休息')
    const finish = [...host.querySelectorAll('button')].find(b => b.textContent === '完成训练并推进循环')
    expect(finish.disabled).toBe(true)
    await click('暂停并保留草稿'); expect(cycleView(mock.S, todayISO()).step).toBe('Push')
    await click('恢复本次训练')
    expect(host.querySelector('[aria-label="1-both-撤销完成"]')).toBeTruthy()
  })
  it('完整执行 Push 后写入原历史并进入 Pull，热身单列', async () => {
    installPersonalPlan(mock.S, { id: 'cycle', today: todayISO(), now: Date.now() })
    await render(); await click('开始 / 补录本阶段训练')
    for (let i = 0; i < 4; i++) {
      for (const b of [...host.querySelectorAll('button[aria-label$="完成本组"]')]) await act(async () => b.click())
      await render(); if (i < 3) await click('下一动作')
    }
    await click('完成训练并推进循环')
    expect(mock.S.workouts).toHaveLength(1); expect(mock.S.workouts[0].entries[0].sets[0].warmup).toBe(true)
    expect(cycleView(mock.S, todayISO()).step).toBe('Pull')
    expect(host.textContent).toContain('Push 已记录')
  })
  it('器材界面区分实测与理论，单只/双只可选', async () => {
    installPersonalPlan(mock.S, { id: 'cycle', today: todayISO(), now: 1 }); mock.search = '?section=equipment'
    await render(); expect(host.textContent).toContain('0.2 / 1.3'); expect(host.textContent).toContain('实测配置')
    expect(host.querySelectorAll('.personal-loads article')).toHaveLength(12)
  })
  it('无记录时分析页不虚构成绩，退出模式不清空数据', async () => {
    installPersonalPlan(mock.S, { id: 'cycle', today: todayISO(), now: 1 }); mock.search = '?section=analysis'
    await render(); expect(host.textContent).toContain('没有实际训练记录')
    await click('关闭个人模式，回到原版'); expect(mock.S.personalMode).toBe(false); expect(mock.S.routines).toHaveLength(3)
  })
})
