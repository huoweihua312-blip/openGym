import { describe, it, expect } from 'vitest'
import { STEPS, nextDay, validDay, cycleView, advanceCycle, sessionComplete, mergePersonalMap } from '../../../api/personal/cycle.js'
import { installPersonalPlan, startPersonalSession, personalSession, recordPersonalSet, finishPersonalSession } from './personal-session.js'
import { symmetricLoads, availableWeights, defaultEquipment, calibrationWarning, validateEquipment, loadChangeCost, recommendLoad } from './personal-equipment.js'
import { personalAdvice } from './personal-progression.js'
import { mergeStates, stampChange } from './sync-merge.js'
import { effectiveRoutineIds } from './history.js'
import { effectiveRoutineId } from '../../../api/queue.js'
import { refillAfter } from './rotation.js'
const TODAY = '2026-10-25'
function state() {
  const s = { unit: 'kg', workouts: [], routines: [], week: {}, dayPlan: {}, exWeights: {} }
  installPersonalPlan(s, { id: 'cycle', today: TODAY, now: 1 })
  return s
}
function complete(s, eventId, day = TODAY, now = 100) {
  const slot = startPersonalSession(s, day, now)
  const a = personalSession(s, slot)
  a.entries.forEach((e, ei) => e.sets.forEach((r, si) => {
    if (r.warmup) return
    for (const side of r.sides ? ['L', 'R'] : ['both']) recordPersonalSet(s, slot, ei, si, side, { done: true, rir: 2, quality: 'good' }, now + 1, day)
  }))
  finishPersonalSession(s, { eventId, today: day, now: now + 2 })
}
describe('个人循环、完成与恢复', () => {
  it('不改原计划和历史，重复安装不重复建训练日', () => {
    const s = state(); s.workouts.push({ id: 'legacy' }); s.queue = { ids: ['old'] }
    installPersonalPlan(s, { id: 'other', today: TODAY, now: 2 })
    expect(s.routines).toHaveLength(3); expect(s.queue.ids).toEqual(['old']); expect(s.workouts[0].id).toBe('legacy')
  })
  it('拒绝在 lb 档案中直接装入 kg 数值', () => expect(() => installPersonalPlan({ unit: 'lb' }, { id: 'x', today: TODAY, now: 1 })).toThrow(/kg/))
  it('空记录、只完成热身不能推进', () => {
    const s = state(), slot = startPersonalSession(s, TODAY, 2)
    recordPersonalSet(s, slot, 0, 0, 'both', { done: true }, 3, TODAY)
    expect(() => finishPersonalSession(s, { eventId: 'x', today: TODAY, now: 4 })).toThrow(/必做/)
    expect(cycleView(s, TODAY).step).toBe('Push')
  })
  it('缺少一个正式组时保持当前阶段', () => {
    const s = state(), slot = startPersonalSession(s, TODAY, 2)
    expect(sessionComplete(personalSession(s, slot), s.routines[0])).toBe(false)
  })
  it('临时停练后仍是原阶段，草稿跨自然日保留', () => {
    const s = state(), slot = startPersonalSession(s, TODAY, 2)
    recordPersonalSet(s, slot, 0, 1, 'both', { done: true }, 3, TODAY)
    expect(cycleView(s, '2026-12-01').slot).toBe(slot)
    expect(personalSession(JSON.parse(JSON.stringify(s)), slot).entries[0].sets[1].done).toBe(true)
  })
  it('允许同一天三练；肩/核心后下一自然日才可确认休息', () => {
    const s = state(); complete(s, 'push'); complete(s, 'pull', TODAY, 200); complete(s, 'shoulder', TODAY, 300)
    expect(cycleView(s, TODAY)).toMatchObject({ step: 'Rest', readyOn: '2026-10-26', waiting: true })
    expect(() => advanceCycle(s, { id: 'rest', today: TODAY, at: 400 })).toThrow(/日期/)
    expect(cycleView(s, '2026-11-01').step).toBe('Rest')
    advanceCycle(s, { id: 'rest', today: '2026-11-01', day: '2026-10-26', at: 500 })
    expect(cycleView(s, '2026-11-01')).toMatchObject({ step: 'Push', readyOn: '2026-10-27' })
  })
  it('休息当天不可开始下一轮 Push', () => {
    const s = state(); complete(s, 'p'); complete(s, 'q'); complete(s, 'r')
    advanceCycle(s, { id: 'rest', today: '2026-10-26', at: 500 })
    expect(() => startPersonalSession(s, '2026-10-26', 501)).toThrow(/训练/)
  })
  it('相同完成操作的网络重试只写一次历史和一次事件', () => {
    const s = state(); complete(s, 'once')
    finishPersonalSession(s, { eventId: 'once', today: TODAY, now: 999 })
    expect(s.workouts).toHaveLength(1); expect(Object.keys(s.personalEvents)).toHaveLength(1)
  })
  it('左右训练必须两侧完成', () => {
    const r = { ex: [{ id: 'x', sets: 1, side: true }] }
    const w = { entries: [{ id: 'x', sets: [{ sides: { L: { done: true, r: 10 }, R: { done: false, r: 10 } } }] }] }
    expect(sessionComplete(w, r)).toBe(false); w.entries[0].sets[0].sides.R.done = true
    expect(sessionComplete(w, r)).toBe(true)
  })
  it('取消和恢复不推进，也不清空组', () => {
    const s = state(); const slot = startPersonalSession(s, TODAY, 1)
    recordPersonalSet(s, slot, 0, 1, 'both', { done: true }, 2, TODAY)
    s.personalSessions[slot].status = 'cancelled'
    expect(startPersonalSession(s, TODAY, 4)).toBe(slot)
    expect(personalSession(s, slot).entries[0].sets[1].done).toBe(true)
  })
  it('补录完成需要合法日期且不伪造未来', () => {
    const s = state(); expect(() => advanceCycle(s, { id: 'x', today: TODAY, day: '2026-10-26', at: 10 })).toThrow(/无效/)
    expect(validDay('2026-02-30')).toBe(false); expect(nextDay('2026-12-31')).toBe('2027-01-01')
  })
  it('手动纠正保留原因和原历史，不通过日历自动推进', () => {
    const s = state(); complete(s, 'done'); const old = structuredClone(s.workouts)
    expect(() => advanceCycle(s, { id: 'c', today: TODAY, at: 5, index: 0 })).toThrow(/原因/)
    advanceCycle(s, { id: 'c', today: TODAY, at: 6, index: 0, reason: '误结束，回到 Push' })
    expect(cycleView(s, TODAY).step).toBe('Push'); expect(s.workouts).toEqual(old)
  })
  it('已完成训练不能继续改旧槽位', () => {
    const s = state(); complete(s, 'done')
    expect(() => recordPersonalSet(s, 'cycle', 0, 1, 'both', { r: 9 }, 800, TODAY)).toThrow(/进度/)
  })
  it('无效组输入不落盘', () => {
    const s = state(); startPersonalSession(s, TODAY, 1)
    for (const patch of [{ w: -1 }, { r: Infinity }, { rir: 12 }, { quality: '猜测' }, { r: 0, done: true }]) expect(() => recordPersonalSet(s, 'cycle', 0, 1, 'both', patch, 2, TODAY)).toThrow()
  })
  it('前端、提醒和原 Rotation 都尊重个人循环', () => {
    const s = state(); expect(effectiveRoutineIds(s, TODAY)).toEqual([s.routines[0].id]); expect(effectiveRoutineId(s, TODAY)).toBe(s.routines[0].id)
    expect(refillAfter(s, {})).toBe(false)
    complete(s, 'p'); complete(s, 'q'); complete(s, 'r')
    expect(effectiveRoutineIds(s, TODAY)).toEqual([]); expect(effectiveRoutineId(s, TODAY)).toBe(null)
  })
})
describe('同步与幂等', () => {
  it('两个设备修改不同组时保留双方；合并顺序不改变结果', () => {
    const base = state(); startPersonalSession(base, TODAY, 1)
    const a = structuredClone(base), b = structuredClone(base)
    recordPersonalSet(a, 'cycle', 0, 1, 'both', { done: true }, 2, TODAY)
    recordPersonalSet(b, 'cycle', 0, 2, 'both', { done: true }, 3, TODAY)
    a._ts = stampChange(base, a, 2); b._ts = stampChange(base, b, 3)
    for (const merged of [mergeStates(a, b), mergeStates(b, a)]) {
      const sets = personalSession(merged, 'cycle').entries[0].sets
      expect(sets[1].done && sets[2].done).toBe(true)
    }
  })
  it('同时完成同一槽位仅推进一步；分叉仍留在事件中', () => {
    const a = state(), b = structuredClone(a); complete(a, 'phone'); complete(b, 'tablet')
    a._ts = 4; b._ts = 5
    for (const merged of [mergeStates(a, b), mergeStates(b, a)]) {
      const v = cycleView(merged, TODAY)
      expect(v.step).toBe('Pull'); expect(v.ordinal).toBe(1); expect(v.conflicts).toHaveLength(1)
      expect(Object.keys(merged.personalEvents)).toHaveLength(2); expect(merged.workouts).toHaveLength(1)
    }
  })
  it('时间戳相同仍以确定性内容解决同组冲突', () => {
    const a = { x: { row: { r: 8 }, _ts: 1 } }, b = { x: { row: { r: 9 }, _ts: 1 } }
    expect(mergePersonalMap(a, b)).toEqual(mergePersonalMap(b, a))
    expect(mergePersonalMap(a, a)).toEqual(a)
  })
})
describe('真实器材库存', () => {
  it('双哑铃 12 种、一只哑铃 45 种合法组合', () => {
    expect(symmetricLoads(defaultEquipment(), 2)).toHaveLength(12)
    expect(symmetricLoads(defaultEquipment(), 1)).toHaveLength(45)
  })
  it('每个组合都满足两端对称和整套库存', () => {
    const p = defaultEquipment()
    for (const bells of [1, 2]) for (const c of symmetricLoads(p, bells)) for (const x of p.plates) expect(c.side.filter(w => w === x.kg).length * 2 * bells).toBeLessThanOrEqual(x.count)
  })
  it('保留实测 14.7 / 17.3，不推断虚假的杆重', () => {
    const p = defaultEquipment(), c = symmetricLoads(p)
    expect(c.find(x => x.measuredKg === 14.7).plateKg).toBe(14.5)
    expect(c.find(x => x.measuredKg === 17.3).plateKg).toBe(16)
    expect(c.every(x => x.theoreticalKg === null)).toBe(true)
    expect(calibrationWarning(p)).toMatch(/0.2 \/ 1.3/)
    expect(availableWeights(p)).toEqual([7.5, 14.7, 17.3])
  })
  it('知道真实杆重后才给出理论总重，实测仍单列', () => {
    const p = defaultEquipment(); p.handleKg = 1
    const c = symmetricLoads(p).find(x => x.measuredKg === 14.7)
    expect(c.theoreticalKg).toBe(15.5); expect(c.weight).toBe(14.7)
  })
  it('装片成本按两端计算，推荐为合法组合', () => {
    expect(loadChangeCost([3, 3, 1.25], [3, 3, 2])).toBe(4)
    expect(recommendLoad(defaultEquipment(), 14.7).weight).toBe(14.7)
  })
  it('拒绝负数、重复重量、过大组合和不合法实测', () => {
    for (const plates of [[{ kg: -1, count: 1 }], [{ kg: 3, count: 3.5 }], [{ kg: 3, count: 4 }, { kg: 3, count: 2 }], Array.from({ length: 8 }, (_, i) => ({ kg: i + 1, count: 40 }))]) expect(() => validateEquipment({ ...defaultEquipment(), plates })).toThrow()
  })
})
describe('可追溯进阶', () => {
  const c = { id: 'x', sets: 2, reps: 12 }, p = defaultEquipment()
  const workout = (id, reps, weight = 7.5, extra = {}) => ({ id, d: `2026-10-${id}`, routineIds: ['r'], entries: [{ id: 'x', sets: reps.map(r => ({ r, w: weight, done: true, rir: 2, quality: 'good', ...extra })) }] })
  it('没有历史时不猜能力', () => expect(personalAdvice({ workouts: [] }, c, 'r', p).kind).toBe('record'))
  it('达到上限但重量跨度过大时不自动加重', () => {
    const x = personalAdvice({ workouts: [workout('20', [12, 12])] }, c, 'r', p)
    expect(x.kind).toBe('gap'); expect(x.evidence[0].workoutId).toBe('20')
  })
  it('RIR 或质量未记不能推断达标', () => {
    for (const extra of [{ rir: null }, { quality: null }, { rir: 0 }, { quality: 'poor' }]) expect(personalAdvice({ workouts: [workout('20', [12, 12], 7.5, extra)] }, c, 'r', p).kind).toBe('reps')
  })
  it('确有合理下一档才建议加重，输入历史不变', () => {
    const s = { workouts: [workout('20', [12, 12])] }, before = structuredClone(s)
    const x = personalAdvice(s, c, 'r', { ...p, fixed: [7.5, 8] })
    expect(x).toMatchObject({ kind: 'weight', weight: 8 }); expect(s).toEqual(before)
  })
  it('相同重量连续两次下降提醒检查恢复，不诊断身体状态', () => {
    const x = personalAdvice({ workouts: [workout('20', [12, 12]), workout('21', [11, 10]), workout('22', [9, 9])] }, c, 'r', p)
    expect(x.kind).toBe('recovery'); expect(x.evidence).toHaveLength(3)
  })
  it('热身不触发进阶，自重不推荐哑铃重量', () => {
    expect(personalAdvice({ workouts: [workout('20', [15, 15], 7.5, { warmup: true })] }, c, 'r', p).kind).toBe('record')
    expect(personalAdvice({ workouts: [workout('20', [12, 12], 0)] }, { ...c, bodyweight: true }, 'r', p).weight).toBe(0)
  })
})
