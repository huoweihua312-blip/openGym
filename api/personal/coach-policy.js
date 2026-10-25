// AI 草案只允许明确确认后的处方微调；循环、历史、热身和器材库存不在写入范围。
export const PERSONAL_COACH_CHANGES = ['sets', 'reps', 'repsMin', 'rename-routine', 'reorder']
export function validatePersonalChanges(S, changes) {
  if (!S.personalMode || !S.personalCycle) return
  const routines = structuredClone(S.routines || [])
  for (const c of changes) {
    if (!PERSONAL_COACH_CHANGES.includes(c.type) || !S.personalCycle.ids?.includes(c.target?.routineId)) throw Error('个人循环：此草案超出允许的处方微调范围，不能应用。')
    const r = routines.find(r => r.id === c.target.routineId)
    if (!r) throw Error('个人循环：训练日不存在')
    if (c.type === 'rename-routine' && (typeof c.after !== 'string' || !c.after.trim() || c.after.length > 80)) throw Error('个人循环：训练日名称无效')
    if (c.type === 'reorder' && (!Array.isArray(c.after) || c.after.length !== r.ex.length || new Set(c.after).size !== r.ex.length || c.after.some(id => !r.ex.some(e => e.id === id)))) throw Error('个人循环：动作顺序必须包含原有全部动作且不重复')
    if (['sets', 'reps', 'repsMin'].includes(c.type)) {
      const e = r.ex?.find(e => e.id === c.target.exId)
      if (!e || !Number.isInteger(c.after) || c.after < 1 || c.after > (c.type === 'sets' ? 12 : 100) || (e.side && c.type !== 'sets' && c.after % 2)) throw Error('个人循环：组数或次数无效，单侧动作需保持可均分的总次数')
      e[c.type] = c.after
    }
  }
  for (const r of routines.filter(r => S.personalCycle.ids.includes(r.id))) {
    for (const e of r.ex || []) if ((e.repsMin || 1) > e.reps) throw Error('个人循环：次数下限不能超过上限')
  }
}
