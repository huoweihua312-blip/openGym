import { cycleView } from './cycle.js'
import { availableWeights, validateEquipment } from './personal-equipment.js'
import { personalAdvice } from './personal-progression.js'
import { PERSONAL_COACH_CHANGES } from './coach-policy.js'

// 传给原 Coach 的显式白名单：不递归复制 S、器材备注、会话或凭据。
export function personalCoachContext(S, today) {
  if (!S?.personalMode || !S.personalCycle) return null
  const v = cycleView(S, today)
  let equipment
  try { equipment = validateEquipment(S.personalEquipment) } catch { return { policy: 'explain-only', step: v?.step || null, equipment: 'invalid-or-missing' } }
  return {
    policy: 'user-confirmed-plan-only',
    allowedConfirmedChanges: PERSONAL_COACH_CHANGES,
    rules: ['Push→Pull→Shoulder/Core→Rest', 'all-required-work-sets-before-advance', 'explicit-natural-rest-day', 'no-model-write-to-history-or-cycle'],
    step: v?.step || null,
    knownWeightsKgPerBell: availableWeights(equipment).slice(0, 100),
    handleKgKnown: equipment.handleKg != null,
    advice: (S.routines || []).filter(r => S.personalCycle.ids.includes(r.id)).flatMap(r => (r.ex || []).slice(0, 30).map(cfg => {
      const a = personalAdvice(S, cfg, r.id, equipment)
      return { exerciseId: String(cfg.id).slice(0, 80), kind: a.kind, reason: a.reason, weight: a.weight ?? null,
        evidence: a.evidence.map(e => ({ workoutId: String(e.workoutId).slice(0, 128), date: e.date })) }
    })).slice(0, 90),
  }
}
