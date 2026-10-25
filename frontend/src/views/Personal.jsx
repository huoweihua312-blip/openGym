import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO, uid } from '../lib/format.js'
import { cycleView, advanceCycle, STEPS, sessionComplete } from '../../../api/personal/cycle.js'
import { installPersonalPlan, startPersonalSession, personalSession, recordPersonalSet, finishPersonalSession, LABELS } from '../lib/personal-session.js'
import { availableWeights, defaultEquipment, symmetricLoads, calibrationWarning, validateEquipment, loadChangeCost, recommendLoad } from '../lib/personal-equipment.js'
import { personalAdvice, decidePersonalAdvice } from '../lib/personal-progression.js'
import { copyText } from '../lib/clipboard.js'
import '../personal.css'

// 普通局域网 HTTP 没有 randomUUID；记录标识复用上游 uid，不降低通行密钥要求。
const uuid = () => globalThis.crypto?.randomUUID?.() || uid()
const nameOf = e => LABELS[e.id] || e.id
const rowsOf = a => a?.entries?.flatMap(e => e.sets.flatMap(r => r.sides ? [r.sides.L, r.sides.R].map(s => ({ ...s, warmup: r.warmup })) : [r])) || []
export default function Personal() {
  const S = useStore(s => s.S), update = useStore(s => s.update), nav = useNavigate(), location = useLocation()
  const [message, setMessage] = useState(''), [now, setNow] = useState(Date.now()), [current, setCurrent] = useState(0)
  const [day, setDay] = useState(todayISO()), [reason, setReason] = useState(''), [correctTo, setCorrectTo] = useState('0')
  const [bells, setBells] = useState(2), [profileText, setProfileText] = useState(''), [summary, setSummary] = useState(null)
  const [loadTarget, setLoadTarget] = useState(14.7), [mounted, setMounted] = useState(0)
  const section = new URLSearchParams(location.search).get('section') || 'train'
  const today = todayISO(), v = useMemo(() => cycleView(S, today), [S, today])
  const a = useMemo(() => v && personalSession(S, v.slot), [S, v?.slot])
  const equipment = useMemo(() => S.personalEquipment || defaultEquipment(), [S.personalEquipment])
  const loads = symmetricLoads(equipment, bells)
  const currentLoad = loads[mounted] || loads[0]
  const suggestedLoad = recommendLoad(equipment, loadTarget, bells, currentLoad?.side || [])
  const routine = S.routines?.find(r => r.id === v?.routineId)
  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const id = setInterval(refresh, 1000)
    document.addEventListener('visibilitychange', refresh); window.addEventListener('focus', refresh)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh) }
  }, [])
  useEffect(() => { setCurrent(0) }, [v?.slot])
  const act = fn => { try { update(s => fn(s)); setMessage(''); return true } catch (e) { setMessage(e.message); return false } }
  const all = rowsOf(a), work = all.filter(r => !r.warmup), done = work.filter(r => r.done).length
  const warm = all.filter(r => r.warmup), warmDone = warm.filter(r => r.done).length
  const e = a?.entries?.[Math.min(current, a.entries.length - 1)]
  const last = e && [...(S.workouts || [])].sort((a, b) => a.d.localeCompare(b.d) || (a.start || 0) - (b.start || 0)).reverse().find(w => w.entries?.some(x => x.id === e.id))
  const latestTick = all.filter(r => r.done).reduce((t, r) => Math.max(t, r.at || 0), 0)
  const rest = Math.max(0, Math.ceil((latestTick + (S.restSec || 90) * 1000 - now) / 1000))
  function setRow(si, side, patch) {
    const ok = act(s => recordPersonalSet(s, v.slot, current, si, side, patch, Date.now(), todayISO()))
    if (ok && patch.done === true) useUI.getState().startRest(S.restSec || 90, current)
  }
  function finish() {
    const id = uuid(), finished = { name: a.name, done, warmDone, day: day || a.d }
    try { update(s => finishPersonalSession(s, { eventId: id, today, day: day || a.d, now: Date.now() })); useUI.getState().stopRest?.(); setSummary(finished); setMessage('') }
    catch (e) { setMessage(e.message) }
  }
  const openCoach = async () => {
    const text = `请用中文分析我的个人三练一休训练。循环为 Push→Pull→Shoulder/Core→Rest，当前 ${v?.step || '未建立'}。只解释以下确定性规则的建议和实际训练记录，不虚构完成/恢复情况，不直接修改历史或循环。\n已知器材重量（kg/只）：${availableWeights(equipment).join('、')}。杆重未知时不得猜测。\n` +
      (routine?.ex || []).map(c => `${nameOf(c)}：${personalAdvice(S, c, routine.id, equipment).reason}`).join('\n')
    try { await copyText(text); setMessage('分析要求已复制，进入 AI 教练后粘贴发送。'); nav('/coach') } catch { setMessage(text) }
  }
  if (S.unit !== 'kg') return <main className="personal narrow"><h1>先确认重量单位</h1><p>个人版配重档案使用 kg。请在设置中通过原有转换功能切换回 kg 后继续，避免把 kg 当作 lb 写入训练。</p><button onClick={() => nav('/settings')}>打开设置</button><button onClick={() => { act(s => { s.personalMode = false }); nav('/home') }}>退出个人模式</button></main>
  return <main className="personal narrow">
    <header className="personal-header"><div><p className="personal-kicker">OPEN GYM / PERSONAL</p><h1>把这一组练好。</h1><p>{today} · 家庭训练</p></div><button onClick={() => nav('/settings')} aria-label="设置">设置</button></header>
    {!S.personalCycle ? <section className="personal-panel"><h2>你的三练一休</h2><p>Push → Pull → Shoulder/Core → Rest。按实际完成推进；已有计划和训练记录会保留。</p><button className="personal-primary" onClick={() => act(s => installPersonalPlan(s, { id: uuid(), today, now: Date.now() }))}>创建个人训练计划</button></section> : <>
      <ol className="personal-cycle" aria-label="训练循环">{STEPS.map((label, i) => <li key={label} aria-current={v?.index === i ? 'step' : undefined}><span>{i + 1}</span>{label === 'Shoulder/Core' ? '肩 / 核心' : label === 'Rest' ? '休息' : label}</li>)}</ol>
      {v?.conflicts?.length > 0 && <p role="status">发现同一阶段的并发操作，已合并为一次推进；原记录保留，请在下方事件记录复核。</p>}
      <nav className="personal-sections" aria-label="个人功能">{[['train', '训练'], ['plan', '计划'], ['analysis', '进阶'], ['equipment', '器材']].map(([id, label]) => <button key={id} className={section === id ? 'selected' : ''} onClick={() => nav(`/personal?section=${id}`)}>{label}</button>)}</nav>
      {section === 'train' && <>
        <section className="personal-panel personal-next"><div><p className="personal-kicker">当前阶段</p><h2>{v?.step}</h2><p>{v?.waiting ? `${v.readyOn} 起可继续；今天先恢复。` : '未完成的进度不会因为日期改变而丢失。'}</p></div><strong>{v?.ordinal || 0}<small>次确认</small></strong></section>
        {summary && <section className="personal-panel" role="status"><h2>{summary.name} 已记录</h2><p>{summary.day} · 正式组 {summary.done} · 热身组 {summary.warmDone}</p><button onClick={() => nav('/history')}>查看训练总结</button><button onClick={() => setSummary(null)}>收起</button></section>}
        {v?.index === 3 ? <section className="personal-panel"><h2>明确记录一次休息</h2><p>休息最早为 {v.readyOn}。停练不会自动算休息。记录真实休息日后，下一自然日可进入 Push。</p><label>实际休息日<input type="date" min={v.readyOn} max={today} value={day} onChange={ev => setDay(ev.target.value)} /></label><button className="personal-primary" disabled={v.waiting} onClick={() => act(s => advanceCycle(s, { id: uuid(), today, day, at: Date.now() }))}>确认这一天已休息</button></section>
          : !a || a.status === 'cancelled' ? <section className="personal-panel"><h2>{a ? '训练草稿已保留' : '准备开始'}</h2><p>先做 2–5 分钟轻活动、关节活动，再完成动作的专门热身组。热身不计入正式训练量。</p><button className="personal-primary" disabled={v?.waiting || !routine} onClick={() => act(s => { startPersonalSession(s, today, Date.now()); s.personalMode = true })}>{a ? '恢复本次训练' : '开始 / 补录本阶段训练'}</button>{!routine && <p role="alert">关联训练日已被删除。请恢复计划或在进度纠正中选择有效阶段。</p>}</section>
          : e && <>
            <div className="personal-progress"><span>正式组 {done} / {work.length}</span><span>热身 {warmDone} / {warm.length}</span><progress max={work.length || 1} value={done} aria-label="训练完成进度" /></div>
            <section className="personal-panel personal-focus"><div className="personal-ex-head"><span>动作 {current + 1} / {a.entries.length}</span><span role="timer" aria-live="off">{rest > 0 ? `休息 ${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}` : '准备好下一组'}</span></div><h2>{nameOf(e)}</h2><p>重量按每只哑铃记录{e.target.side ? '；左右分别记录' : ''}。RIR 为本组结束后估计还能完成的次数。</p>
              {e.target.personalApproximate && <p>侧平举约 3 kg 是原计划近似值，请核实实际器材重量；不作为已校准重量推荐。</p>}
              {last && <p className="personal-last">上次（{last.d}）：{last.entries.find(x => x.id === e.id).sets.filter(r => r.done && !r.warmup).map(r => `${r.w || 0}kg × ${r.r}`).join(' / ')}</p>}
              {e.sets.map((row, si) => <div className={'personal-set ' + (row.warmup ? 'warmup' : '')} key={si}><h3>{row.warmup ? '专门热身' : `正式组 ${si + 1 - (e.target.warmupSets || 0)}`}</h3>{(row.sides ? ['L', 'R'] : ['both']).map(side => { const r = side === 'both' ? row : row.sides[side]; return <div className="personal-set-controls" key={side}>
                {side !== 'both' && <b>{side === 'L' ? '左侧' : '右侧'}</b>}
                <label>kg<input aria-label={`${si}-${side}-重量`} type="number" inputMode="decimal" min="0" max="250" step="0.1" disabled={e.target.bodyweight} value={r.w} onChange={ev => setRow(si, side, { w: Number(ev.target.value) })} /></label>
                <label>次数<input aria-label={`${si}-${side}-次数`} type="number" inputMode="numeric" min="0" max="1000" value={r.r} onChange={ev => setRow(si, side, { r: Number(ev.target.value) })} /></label>
                {!row.warmup && <><label>RIR<select aria-label={`${si}-${side}-RIR`} value={r.rir ?? ''} onChange={ev => setRow(si, side, { rir: ev.target.value === '' ? null : Number(ev.target.value) })}><option value="">未记</option>{[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></label><label>质量<select aria-label={`${si}-${side}-质量`} value={r.quality ?? ''} onChange={ev => setRow(si, side, { quality: ev.target.value || null })}><option value="">未记</option><option value="good">良好</option><option value="mixed">一般</option><option value="poor">变形</option></select></label></>}
                <button className={r.done ? 'personal-done' : 'personal-primary'} aria-label={`${si}-${side}-${r.done ? '撤销完成' : '完成本组'}`} onClick={() => setRow(si, side, { done: !r.done })}>{r.done ? '已完成 ↶' : '完成'}</button>
              </div> })}</div>)}
              <div className="personal-actions"><button disabled={current === 0} onClick={() => setCurrent(i => i - 1)}>上一动作</button><button disabled={current === a.entries.length - 1} onClick={() => setCurrent(i => i + 1)}>下一动作</button></div>
            </section>
            <section className="personal-panel"><label>实际训练日期<input type="date" min={v.readyOn} max={today} value={day} onChange={ev => setDay(ev.target.value)} /></label><button className="personal-primary" disabled={!sessionComplete(a, a.personalPlan || routine)} onClick={finish}>完成训练并推进循环</button><button onClick={() => act(s => { s.personalSessions[v.slot] = { ...s.personalSessions[v.slot], status: 'cancelled', _ts: Date.now() } })}>暂停并保留草稿</button></section>
          </>}
      </>}
      {section === 'plan' && <section className="personal-panel"><h2>三练一休计划</h2>{S.personalCycle.ids.map(id => { const r = S.routines.find(x => x.id === id); return <article key={id}><h3>{r?.name || '训练日缺失'}</h3>{r?.ex?.map(c => <p key={c.id}>{nameOf(c)} · {c.weight || '自重'}{c.weight ? ' kg/只' : ''} · {c.sets}×{c.side ? c.repsMin / 2 : c.repsMin}–{c.side ? c.reps / 2 : c.reps}{c.side ? ' / 每侧' : ''}</p>)}<button onClick={() => nav(`/plan/r/${id}`)}>编辑动作与目标</button></article>})}<p>每个动作均带专门热身组。编辑后已开始的训练保留开始时的计划快照。</p></section>}
      {section === 'analysis' && <section className="personal-panel"><h2>有记录，才有建议。</h2><p>建议不会自动应用。采用前请结合实际完成情况判断。</p>
        {S.personalCycle.ids.flatMap(id => (S.routines.find(r => r.id === id)?.ex || []).map(c => {
          const advice = personalAdvice(S, c, id, equipment)
          const decision = S.personalDecisions?.[`${id}|${c.id}|${advice.evidence.at(-1)?.workoutId}`]
          return <article key={`${id}-${c.id}`}><h3>{nameOf(c)}</h3><p>{advice.reason}</p>
            <small>依据：{advice.evidence.map(e => `${e.date}：${e.rows.length} 组 / ${e.rows.reduce((n, r) => n + r.r, 0)} 总次数（${e.workoutId}）`).join('；') || '暂无'}</small>
            {Number.isFinite(advice.weight) && <p>建议重量：{advice.weight} kg/只</p>}
            {decision ? <p>{decision.action === 'accept' ? '已采用为下次目标' : '已忽略本次建议'} · 已保留依据</p> : advice.evidence.length > 0 && <div className="personal-actions">
              {advice.kind === 'weight' && <button onClick={() => act(s => decidePersonalAdvice(s, id, c.id, 'accept', Date.now()))}>采用为下次重量</button>}
              <button onClick={() => act(s => decidePersonalAdvice(s, id, c.id, 'ignore', Date.now()))}>忽略本次建议</button>
            </div>}
          </article>
        }))}
        <button onClick={openCoach}>复制规则依据并打开 AI 教练</button><p>AI 草案需逐项确认。允许微调组数、次数、动作顺序和名称；不能改写循环、热身、器材或训练历史。</p>
      </section>}
      {section === 'equipment' && <section className="personal-panel"><h2>少拆一次，多练一组。</h2>
        <label>当前每只哑铃两端各装<select value={mounted} onChange={ev => setMounted(Number(ev.target.value))}>{loads.map((c, i) => <option value={i} key={i}>{c.side.join(' + ') || '空杆'}</option>)}</select></label>
        <label>目标重量 kg/只<input type="number" inputMode="decimal" min="0" max="250" step="0.1" value={loadTarget} onChange={ev => setLoadTarget(Number(ev.target.value))} /></label>
        {suggestedLoad && <p>合法推荐：{suggestedLoad.weight} kg/只，两端各 {suggestedLoad.side.join(' + ') || '空杆'}；每只需拆装 {loadChangeCost(currentLoad?.side || [], suggestedLoad.side)} 片。优先接近目标，重量相同时选拆装更少的组合。</p>}
      </section>}
      {section === 'equipment' && <section className="personal-panel"><h2>器材与对称配重</h2><p>{calibrationWarning(equipment)}</p><label>同时使用<select value={bells} onChange={ev => setBells(Number(ev.target.value))}><option value="2">两只哑铃</option><option value="1">单只哑铃</option></select></label><p>每只已知重量：{availableWeights(equipment, bells).join(' / ')} kg。未称重、杆重未知的组合仅列片重。</p><div className="personal-loads">{symmetricLoads(equipment, bells).map((c, i) => <article key={i}><b>{c.measuredKg ?? c.theoreticalKg ?? `${c.plateKg} + 杆重?`} kg</b><div className="personal-plates" aria-label={`两端各 ${c.side.join('+') || '空杆'}`}><span>{c.side.join(' + ') || '空'}</span><i>━</i><span>{[...c.side].reverse().join(' + ') || '空'}</span></div><small>{c.source} · {bells} 只库存合法 · 从空杆装片 {loadChangeCost([], c.side)} 片</small></article>)}</div><details><summary>修改器材档案</summary><p>标称片重/总数量、固定哑铃、实测组合；handleKg 保持 null，除非真实称重。下面是结构化编辑器。</p><button onClick={() => setProfileText(JSON.stringify(equipment, null, 2))}>载入当前档案</button><textarea aria-label="器材档案 JSON" rows="14" value={profileText} onChange={ev => setProfileText(ev.target.value)} /><button onClick={() => act(s => { s.personalEquipment = validateEquipment(JSON.parse(profileText)) })}>验证并保存器材</button></details></section>}
      <details className="personal-panel"><summary>进度纠正与事件记录</summary><p>仅纠正当前循环；历史训练、组记录和纠正原因始终保留。</p><label>目标阶段<select value={correctTo} onChange={ev => setCorrectTo(ev.target.value)}>{STEPS.map((s, i) => <option value={i} key={s}>{s}</option>)}</select></label><label>纠正原因<input value={reason} onChange={ev => setReason(ev.target.value)} /></label><button onClick={() => act(s => advanceCycle(s, { id: uuid(), today, at: Date.now(), index: Number(correctTo), reason }))}>记录手动纠正</button><ol>{Object.values(S.personalEvents || {}).filter(ev => ev.cycleId === S.personalCycle.id).map(ev => <li key={ev.id}>{ev.day} · {ev.type} · {v?.accepted.some(x => x.id === ev.id) ? '已采用' : '未采用/并发分支'} {ev.reason || ''}</li>)}</ol></details>
    </>}
    {message && <p className="personal-message" role="alert">{message}</p>}
    <footer className="personal-footer"><button onClick={() => { act(s => { s.personalMode = false }); nav('/home') }}>关闭个人模式，回到原版</button><button onClick={() => nav('/settings')}>账户、同步与提醒</button><a href="https://github.com/huoweihua312-blip/openGym/tree/feature/personal-gym" target="_blank" rel="noopener noreferrer">个人版修改源码 · AGPL</a></footer>
  </main>
}
