import { cycleView, advanceCycle, sessionComplete } from '../../../api/personal/cycle.js'
import { defaultEquipment } from './personal-equipment.js'

export const LABELS = { '0289': '平板哑铃卧推', '0314': '上斜哑铃卧推', '0259': '窄距俯卧撑', '3145': '俯卧撑 Plus',
  '0652': '自重引体向上', '0292': '单臂哑铃划船', '0294': '哑铃弯举', '0405': '哑铃肩推', '0334': '哑铃侧平举', '0857': '健腹轮', '0472': '悬垂举腿' }
const cfg = (id, weight, sets, min, max, extra = {}) => ({ id, weight, sets, repsMin: min, reps: max, rest: 90,
  mode: 'reps', required: true, warmupSets: 1, dbLoad: 'each', ...extra })
export function installPersonalPlan(S, { id, today, now }) {
  if (S.unit !== 'kg') throw Error('此模板按 kg 编写；请先在设置中切换 kg，已有数据由原有单位转换流程处理。')
  S.personalMode = true
  if (S.personalCycle) return
  const routines = [
    { name: 'Push', ex: [cfg('0289', 14.7, 4, 8, 12), cfg('0314', 14.7, 3, 8, 12), cfg('0259', 0, 2, 8, 15, { bodyweight: true }), cfg('3145', 0, 2, 12, 15, { bodyweight: true })] },
    { name: 'Pull', ex: [cfg('0652', 0, 4, 6, 8, { bodyweight: true }), cfg('0292', 14.7, 4, 20, 30, { side: true }), cfg('0294', 7.5, 3, 10, 12)] },
    { name: 'Shoulder/Core', ex: [cfg('0405', 7.5, 3, 12, 20), cfg('0334', 3, 3, 15, 25, { personalApproximate: true }), cfg('0857', 0, 3, 12, 20, { bodyweight: true }), cfg('0472', 0, 3, 15, 20, { bodyweight: true })] },
  ].map((r, i) => ({ ...r, id: `${id}-${i}`, _ts: now, personal: true }))
  S.routines = [...(S.routines || []), ...routines]
  S.personalCycle = { id, ids: routines.map(r => r.id), startedOn: today }
  S.personalEquipment ||= defaultEquipment()
  S.personalEvents ||= {}; S.personalSessions ||= {}; S.personalSets ||= {}
}
export function startPersonalSession(S, today, now) {
  const v = cycleView(S, today)
  if (!v || v.waiting || v.index === 3) throw Error('当前不是可训练阶段')
  const key = v.slot
  if (S.personalSessions?.[key]) {
    S.personalSessions[key] = { ...S.personalSessions[key], status: 'active', _ts: now }
    return key
  }
  const r = S.routines.find(r => r.id === v.routineId)
  if (!r?.ex?.length) throw Error('当前训练计划为空')
  const entries = r.ex.map(e => {
    const n = e.side ? 2 : 1
    const row = () => ({ w: e.bodyweight ? 0 : e.weight, r: (e.repsMin || e.reps) / n, done: false, rir: null, quality: null })
    const work = Array.from({ length: e.sets }, () => e.side ? { sides: { L: row(), R: row() }, phase: 'work' } : { ...row(), phase: 'work' })
    // 不把未知可用的半重量写成已知器材：热身默认自重，训练者可按实际填写。
    const warm = Array.from({ length: e.warmupSets || 0 }, () => ({ w: e.weight >= 14.7 ? 7.5 : 0, r: 8, done: false, phase: 'warmup', warmup: true }))
    return { id: e.id, target: { ...e }, planned: { ...e }, sets: [...warm, ...work] }
  })
  S.personalSessions = { ...S.personalSessions, [key]: { id: key, routineId: r.id, name: r.name, d: today, start: now, entries, personalPlan: structuredClone(r), status: 'active', _ts: now } }
  return key
}
export function personalSession(S, slot) {
  const raw = S.personalSessions?.[slot]
  if (!raw) return null
  const out = structuredClone(raw)
  out.entries.forEach((e, i) => e.sets.forEach((row, j) => {
    const get = side => S.personalSets?.[`${slot}|${i}|${j}|${side}`]?.row
    if (row.sides) {
      for (const side of ['L', 'R']) if (get(side)) row.sides[side] = { ...row.sides[side], ...get(side) }
      row.done = !!(row.sides.L.done && row.sides.R.done)
      row.r = (row.sides.L.r || 0) + (row.sides.R.r || 0); row.w = row.sides.L.w
    } else if (get('both')) Object.assign(row, get('both'))
  }))
  return out
}
export function recordPersonalSet(S, slot, ei, si, side, patch, now, today) {
  const a = personalSession(S, slot), v = cycleView(S, today)
  if (!a || !v || v.slot !== slot || a.status !== 'active') throw Error('这次训练已经结束或进度已变化，请重新打开当前训练')
  const row = a.entries?.[ei]?.sets?.[si]
  const previous = side === 'both' ? row : row?.sides?.[side]
  if (!previous) throw Error('训练组不存在')
  const next = { ...previous, ...patch }
  if (!Number.isFinite(next.w) || next.w < 0 || next.w > 250 || !Number.isFinite(next.r) || next.r < 0 || next.r > 1000 || (next.done && next.r <= 0)) throw Error('重量或次数无效')
  if (next.rir != null && (!Number.isFinite(next.rir) || next.rir < 0 || next.rir > 10)) throw Error('RIR 必须为 0–10 或留空')
  if (next.quality != null && !['good', 'mixed', 'poor'].includes(next.quality)) throw Error('动作质量无效')
  if (next.done && !previous.done) next.at = now
  const key = `${slot}|${ei}|${si}|${side}`
  S.personalSets = { ...S.personalSets, [key]: { row: next, _ts: now } }
}
export function finishPersonalSession(S, { eventId, today, now, day }) {
  if (S.personalEvents?.[eventId]) return S.personalEvents[eventId]
  const v = cycleView(S, today), a = personalSession(S, v?.slot)
  const routine = S.routines?.find(r => r.id === v?.routineId)
  if (!a || !routine || !sessionComplete(a, a.personalPlan || routine)) throw Error('请完成全部必做动作的正式组；未完成的进度会保留。')
  const d = day || a.d
  const w = { id: `personal-${v.slot}`, personalSlot: v.slot, name: a.name, d, start: a.start, end: now,
    routineId: a.routineId, routineIds: [a.routineId], personalPlan: a.personalPlan, entries: a.entries, prs: [], _ts: now }
  S.workouts = [...(S.workouts || []).filter(x => x.id !== w.id), w]
  const event = advanceCycle(S, { id: eventId, today, day: d, at: now })
  S.personalSessions[v.slot] = { ...S.personalSessions[v.slot], status: 'finished', _ts: now }
  return event
}
