export const defaultEquipment = () => ({ version: 1, kind: 'plate-loaded', name: '家庭器材', handleKg: null,
  plates: [{ kg: 3, count: 8 }, { kg: 2, count: 4 }, { kg: 1.25, count: 4 }],
  fixed: [7.5], other: ['引体杆', '弹力带', '健腹轮'],
  measurements: [
    { side: [3, 3, 1.25], totalKg: 14.7, note: '用户实测整只重量，未反推杆重' },
    { side: [3, 3, 2], totalKg: 17.3, note: '用户实测整只重量，未反推杆重' },
  ] })
const key = side => [...side].sort((a, b) => b - a).join(',')
export function validateEquipment(p) {
  if (!p || !Array.isArray(p.plates) || !Array.isArray(p.fixed) || !Array.isArray(p.measurements)) throw Error('器材档案结构不完整')
  if (p.kind != null && !['plate-loaded', 'selectorized'].includes(p.kind)) throw Error('器材类型不支持')
  if (p.plates.length > 8 || p.fixed.length > 100 || p.measurements.length > 100) throw Error('器材记录过多')
  if (p.handleKg != null && (!Number.isFinite(p.handleKg) || p.handleKg < 0 || p.handleKg > 50)) throw Error('杆重必须为空或有效实测值')
  const seen = new Set()
  for (const x of p.plates) {
    if (!Number.isFinite(x.kg) || x.kg <= 0 || x.kg > 50 || !Number.isInteger(x.count) || x.count < 0 || x.count > 40 || seen.has(x.kg)) throw Error('配重片重量/数量无效或重复')
    seen.add(x.kg)
  }
  if (p.fixed.some(w => !Number.isFinite(w) || w <= 0 || w > 200)) throw Error('固定哑铃重量无效')
  for (const m of p.measurements) if (!Array.isArray(m.side) || m.side.length > 20 || m.side.some(w => !seen.has(w)) || !Number.isFinite(m.totalKg) || m.totalKg <= 0 || m.totalKg > 250) throw Error('实测记录无效')
  const combinations = p.plates.reduce((n, x) => n * (Math.floor(x.count / 2) + 1), 1)
  if (combinations > 10000) throw Error('组合数过大，请拆分器材档案')
  return p
}
export function symmetricLoads(profile, bells = 2) {
  validateEquipment(profile)
  if (![1, 2].includes(bells)) throw Error('仅支持一只或两只同时使用')
  let combos = [[]]
  for (const p of profile.plates) combos = combos.flatMap(side => Array.from({ length: Math.floor(p.count / (2 * bells)) + 1 }, (_, n) => [...side, ...Array(n).fill(p.kg)]))
  return combos.map(side => {
    const plateKg = Math.round(side.reduce((s, w) => s + w, 0) * 200) / 100
    const measurement = profile.measurements.find(m => key(m.side) === key(side))
    const theoreticalKg = profile.handleKg == null ? null : Math.round((plateKg + profile.handleKg) * 100) / 100
    return { side: [...side].sort((a, b) => b - a), plateKg, theoreticalKg,
      measuredKg: measurement?.totalKg ?? null, weight: measurement?.totalKg ?? theoreticalKg,
      source: measurement ? '实测配置' : theoreticalKg != null ? '理论总重' : '仅片重，杆重未知', bells }
  }).sort((a, b) => a.plateKg - b.plateKg)
}
export function availableWeights(profile, bells = 2) {
  return [...new Set([...profile.fixed, ...symmetricLoads(profile, bells).map(c => c.weight).filter(w => w != null && w > 0)])].sort((a, b) => a - b)
}
export function calibrationWarning(p) {
  const implied = p.measurements.map(m => Math.round((m.totalKg - 2 * m.side.reduce((s, x) => s + x, 0)) * 100) / 100)
  return new Set(implied).size > 1 ? `称重与标称片重存在差异（隐含杆重 ${implied.join(' / ')} kg）；保留实测，不自动推断杆重。` : null
}
export function loadChangeCost(a = [], b = []) {
  const count = xs => xs.reduce((o, x) => ({ ...o, [x]: (o[x] || 0) + 1 }), {})
  const x = count(a), y = count(b)
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].reduce((n, k) => n + Math.abs((x[k] || 0) - (y[k] || 0)), 0) * 2
}
export function recommendLoad(p, target, bells = 2, current = []) {
  return symmetricLoads(p, bells).filter(c => c.weight != null).sort((a, b) => Math.abs(a.weight - target) - Math.abs(b.weight - target) || loadChangeCost(current, a.side) - loadChangeCost(current, b.side))[0] || null
}
