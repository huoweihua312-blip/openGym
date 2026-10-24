import { availableWeights } from './personal-equipment.js'
// 仅建议，不直接修改计划；证据保留 workoutId，可在历史中复核。
export function personalAdvice(S, cfg, routineId, equipment) {
  const history = (S.workouts || []).filter(w => !w.excludeFromProgression && (!routineId || (w.routineIds || []).includes(routineId)))
    .map(w => ({ w, e: w.entries?.find(e => e.id === cfg.id && !e.noProg) }))
    .filter(x => x.e).sort((a, b) => a.w.d.localeCompare(b.w.d) || (a.w.start || 0) - (b.w.start || 0))
    .map(({ w, e }) => ({ workoutId: w.id, date: w.d,
      rows: (e.sets || []).filter(r => r.phase !== 'warmup' && !r.warmup)
        .flatMap(r => r.sides ? [r.sides.L, r.sides.R] : [r]).filter(r => r?.done && Number.isFinite(r.r) && r.r > 0) }))
    .filter(x => x.rows.length)
  const evidence = history.slice(-3)
  const last = evidence.at(-1)
  if (!last) return { kind: 'record', reason: '没有实际训练记录，先记录一次；不猜测起始能力。', evidence }
  const total = x => x.rows.reduce((n, r) => n + r.r, 0)
  const weights = x => x.rows.map(r => r.w || 0)
  const load = Math.max(...weights(last))
  const sameLoad = evidence.length === 3 && evidence.every(x => weights(x).every(w => w === load))
  if (sameLoad && total(evidence[0]) > total(evidence[1]) && total(evidence[1]) > total(last)) return {
    kind: 'recovery', reason: '相同重量连续两次总次数下降；检查睡眠、饮食和训练安排。记录不能证明身体恢复情况。', evidence }
  const required = cfg.sets * (cfg.side ? 2 : 1)
  const ceiling = cfg.side ? cfg.reps / 2 : cfg.reps
  const complete = last.rows.length >= required
  const quality = last.rows.every(r => r.quality === 'good')
  const effort = last.rows.every(r => Number.isFinite(r.rir) && r.rir >= 1)
  const top = complete && quality && effort && last.rows.every(r => r.r >= ceiling && (r.w || 0) === load)
  if (!top) return { kind: 'reps', weight: load, reason: '维持重量，优先增加次数；所有计划组达次数上限、动作质量良好且保留至少 1 RIR 后再考虑加重。未记录的质量或 RIR 不推断为达标。', evidence }
  if (cfg.bodyweight) return { kind: 'reps', weight: 0, reason: '自重动作已达当前次数上限，可考虑提高难度；不把自重当作哑铃负重。', evidence }
  const next = availableWeights(equipment, cfg.side ? 1 : 2).find(w => w > load + 0.001)
  if (!next) return { kind: 'reps', weight: load, reason: '现有器材没有更高的已知可用重量，先增加次数或停顿，不虚构配重。', evidence }
  if ((next - load) / load > 0.15) return { kind: 'gap', weight: load, candidate: next,
    reason: `下一可用重量 ${next} kg，跨度超过 15%；先增加次数，不自动跳重。`, evidence }
  return { kind: 'weight', weight: next, reason: `全部计划组达到次数上限，质量良好且 RIR≥1；器材支持 ${next} kg，建议下次尝试。`, evidence }
}
