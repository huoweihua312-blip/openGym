// 个人循环的纯投影；不读时钟、磁盘或密钥。调用方传本地自然日。
export const STEPS = ['Push', 'Pull', 'Shoulder/Core', 'Rest']
const list = v => Array.isArray(v) ? v : []
export function validDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return false
  const d = new Date(`${day}T12:00:00Z`)
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === day
}
export function nextDay(day) {
  if (!validDay(day)) throw Error('日期无效')
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
export const workRows = entry => list(entry?.sets).filter(r => r?.phase !== 'warmup' && !r?.warmup)
export const rowDone = r => r?.done === true && Number.isFinite(r.r) && r.r > 0
export function sessionComplete(session, routine) {
  const required = list(routine?.ex).filter(e => e.required !== false)
  return required.length > 0 && required.every(cfg => {
    const entry = list(session?.entries).find(e => e.id === cfg.id)
    const rows = workRows(entry)
    return rows.length >= cfg.sets && rows.every(r => cfg.side
      ? rowDone(r?.sides?.L) && rowDone(r?.sides?.R) : rowDone(r))
  })
}
// 相同时间戳用内容排序，避免两端以“本地优先”形成分叉。
export function mergePersonalMap(a, b) {
  const out = Object.create(null)
  for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    if (['__proto__', 'constructor', 'prototype'].includes(k)) continue
    const x = a?.[k], y = b?.[k]
    if (!x) out[k] = y
    else if (!y) out[k] = x
    else out[k] = (Number(x._ts) || 0) > (Number(y._ts) || 0) ? x
      : (Number(x._ts) || 0) < (Number(y._ts) || 0) ? y
      : JSON.stringify(x) >= JSON.stringify(y) ? x : y
  }
  return out
}

export function cycleView(S, today) {
  const c = S?.personalCycle
  if (!c?.id || !validDay(c.startedOn) || !Array.isArray(c.ids) || c.ids.length !== 3) return null
  let slot = c.id, index = 0, readyOn = c.startedOn, ordinal = 0
  const accepted = [], conflicts = [], seen = new Set()
  const events = Object.values(S.personalEvents || {}).filter(e => e?.cycleId === c.id)
  const byParent = new Map(), routines = new Map(list(S.routines).map(r => [r.id, r])), workouts = new Map(list(S.workouts).map(w => [w.id, w]))
  for (const e of events) { if (!byParent.has(e.parent)) byParent.set(e.parent, []); byParent.get(e.parent).push(e) }
  while (!seen.has(slot)) {
    seen.add(slot)
    const choices = (byParent.get(slot) || []).filter(e => {
      if (!e.id || e.id === slot || !validDay(e.day) || e.day > today) return false
      if (e.type === 'correct') return Number.isInteger(e.index) && e.index >= 0 && e.index < 4 && String(e.reason || '').trim().length > 0
      if (e.day < readyOn) return false
      if (index === 3) return e.type === 'rest'
      if (e.type !== 'complete') return false
      const r = routines.get(c.ids[index]), w = workouts.get(e.workoutId)
      return !!w && !!r && w.personalSlot === slot && w.d === e.day && list(w.routineIds).includes(c.ids[index]) && sessionComplete(w, w.personalPlan || r)
    }).sort((x, y) => (x.at || 0) - (y.at || 0) || x.id.localeCompare(y.id))
    const e = choices[0]
    if (!e) break
    conflicts.push(...choices.slice(1).map(e => e.id))
    accepted.push(e)
    if (e.type === 'correct') { index = e.index; readyOn = e.day }
    else {
      index = (index + 1) % 4
      readyOn = index === 3 || index === 0 ? nextDay(e.day) : e.day
    }
    slot = e.id; ordinal++
  }
  return { slot, index, ordinal, step: STEPS[index], routineId: c.ids[index] || null,
    readyOn, waiting: today < readyOn, accepted, conflicts }
}

export function advanceCycle(S, { id, today, day = today, at, reason, index } = {}) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id || '') || ['__proto__', 'constructor', 'prototype'].includes(id) || !Number.isFinite(at) || !validDay(today) || !validDay(day) || day > today) throw Error('操作或日期无效')
  if (Object.hasOwn(S.personalEvents || {}, id)) return S.personalEvents[id]
  const v = cycleView(S, today)
  if (!v || (index == null && (v.waiting || day < v.readyOn))) throw Error('尚未到当前阶段可完成的日期')
  const e = { id, cycleId: S.personalCycle.id, parent: v.slot, day, at, _ts: at }
  if (index != null) {
    if (!Number.isInteger(index) || index < 0 || index > 3 || !String(reason || '').trim()) throw Error('纠正需要有效阶段和原因')
    Object.assign(e, { type: 'correct', index, reason: String(reason).trim() })
  } else if (v.index === 3) e.type = 'rest'
  else {
    const w = list(S.workouts).find(w => w.id === `personal-${v.slot}` && w.d === day)
    const r = list(S.routines).find(r => r.id === v.routineId)
    if (!w || !r || w.personalSlot !== v.slot || !sessionComplete(w, w.personalPlan || r)) throw Error('全部必做动作的正式组完成后才能推进')
    Object.assign(e, { type: 'complete', workoutId: w.id })
  }
  S.personalEvents = { ...S.personalEvents, [id]: e }
  return e
}
