import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react'
import { MARKET_AMOUNT_MAX, type MarketBatch, type MarketReceipt, type MarketSide, type MarketState } from '../../shared/market-v1.ts'
import { color, font } from '../theme.ts'
import { createMarketSession, type MarketSession } from './market-client.ts'
import { browserMarketStorage, readMarketAnimation, writeMarketAnimation } from './market-cache.ts'
import { expectedReturn, marketRatioLabel, marketTime, pointRatio, positionMood, sideLabel } from './chart-model.ts'
import { MarketChart, MarketWhale, MARKET_WHALE_PATH } from './MarketChart.tsx'

export interface MarketDialogProps { reducedMotion: boolean, online: boolean, onClose(): void, session?: MarketSession }

const CSS = `
[data-liangxiang-market-dialog]{--liangxiang-market-blue:color-mix(in srgb,#456bef 76%,${color.textPrimary});color:${color.textPrimary};font:13px ${font.family};color-scheme:light dark}
[data-liangxiang-market-dialog] *{box-sizing:border-box}
[data-liangxiang-market-dialog] button,[data-liangxiang-market-dialog] input{font:inherit}
[data-liangxiang-market-dialog] button{cursor:pointer;border:1px solid ${color.border};background:${color.bgLayer};color:${color.textPrimary};border-radius:9px;padding:7px 12px;min-height:34px}
[data-liangxiang-market-dialog] button:hover:not(:disabled){border-color:var(--liangxiang-market-blue);background:color-mix(in srgb,#6c9efb 10%,${color.bgLayer})}
[data-liangxiang-market-dialog] button:disabled{opacity:.48;cursor:default}
[data-liangxiang-market-dialog] button:focus-visible,[data-liangxiang-market-dialog] input:focus-visible,[data-liangxiang-market-dialog] summary:focus-visible,[data-liangxiang-market-dialog] svg:focus-visible{outline:2px solid var(--liangxiang-market-blue);outline-offset:3px}
[data-liangxiang-market-dialog] .liangxiang-market-primary{background:var(--liangxiang-market-blue);color:#fff;border-color:transparent}
.liangxiang-market-chart{border:1px solid color-mix(in srgb,#729efb 25%,${color.border});border-radius:16px;background:linear-gradient(180deg,color-mix(in srgb,#7faefb 7%,${color.bgLayer}),${color.bgLayer});overflow:hidden}
.liangxiang-market-chart-readout{padding:12px 16px 0;min-height:32px;font-size:11px;color:${color.textSecondary};font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.liangxiang-market-chart-scroll{overflow-x:auto;scrollbar-width:thin}
.liangxiang-market-chart svg{display:block;width:100%;min-width:570px;max-height:330px;touch-action:pan-y}
.liangxiang-market-chart figcaption{padding:0 16px 12px;font-size:10px;color:${color.textSecondary};line-height:1.6}
.liangxiang-market-batches{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.liangxiang-market-batch{position:relative;border:1px solid ${color.border};border-radius:14px;background:${color.bgLayer};padding:14px;min-width:0;overflow:hidden}
.liangxiang-market-batch[data-status=open]{border-color:color-mix(in srgb,#638ef4 55%,${color.border});box-shadow:inset 0 3px 0 color-mix(in srgb,#638ef4 55%,transparent)}
.liangxiang-market-batch-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.liangxiang-market-batch h3{margin:0;font-size:14px}
.liangxiang-market-batch p{margin:5px 0;color:${color.textSecondary};font-size:11px;line-height:1.6}
.liangxiang-market-pool{height:5px;display:flex;border-radius:6px;overflow:hidden;background:${color.bgSubtle};margin:9px 0}
.liangxiang-market-direction{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0 8px}
[data-liangxiang-market-dialog] button[data-selected=true]{border-color:var(--liangxiang-market-blue);background:color-mix(in srgb,#6c9efb 13%,${color.bgLayer});color:var(--liangxiang-market-blue);font-weight:650}
.liangxiang-market-amount{display:flex;align-items:center;gap:7px;margin:8px 0}
.liangxiang-market-amount input{width:100%;min-width:0;border:1px solid ${color.border};border-radius:8px;padding:7px 9px;background:${color.bgLayer};color:${color.textPrimary};font-variant-numeric:tabular-nums}
.liangxiang-market-quick{display:flex;gap:5px;margin:0 0 10px}
[data-liangxiang-market-dialog] .liangxiang-market-quick button{padding:3px 8px;min-height:26px;font-size:10px;flex:1}
.liangxiang-market-position{display:flex;align-items:center;gap:10px;min-height:86px;margin:7px 0 2px}
.liangxiang-market-position strong{display:block;font-size:12px;margin-bottom:4px}
.liangxiang-market-position small{display:block;font-size:10px;color:${color.textSecondary};line-height:1.6}
.liangxiang-market-whale{position:relative;display:inline-block;width:70px;height:84px;flex:none;overflow:hidden;vertical-align:middle}
.liangxiang-market-whale img{display:block;position:absolute;inset:0;width:100%;height:auto;transform:translateY(0);transition:transform 550ms ease,opacity 350ms ease;will-change:auto}
.liangxiang-market-whale[data-small=true]{width:50px;height:60px}
.liangxiang-market-whale[data-mood=behind] img,.liangxiang-market-whale[data-mood=lost] img{transform:translateY(20px);opacity:.65}
.liangxiang-market-whale[data-mood=waiting] img{opacity:.65}
.liangxiang-market-water{position:absolute;left:0;right:0;top:70%;height:32%;border-top:2px solid color-mix(in srgb,#66b6e8 65%,transparent);border-radius:42% 42% 0 0;background:linear-gradient(180deg,#6fbee830,#5c9de010);pointer-events:none}
.liangxiang-market-whale[data-mood=behind] .liangxiang-market-water,.liangxiang-market-whale[data-mood=lost] .liangxiang-market-water{top:25%;height:75%;background:linear-gradient(180deg,#6fbee842,#5c9de026)}
.liangxiang-market-bubble{display:none;position:absolute;width:5px;height:5px;left:76%;top:65%;border:1px solid #6daee4;border-radius:50%;opacity:.65}
.liangxiang-market-bubble:last-child{left:20%;width:3px;height:3px;top:50%;animation-delay:1.3s!important}
.liangxiang-market-whale[data-mood=behind] .liangxiang-market-bubble{display:block}
[data-liangxiang-market-dialog][data-animated=true] .liangxiang-market-whale[data-mood=ahead] img,[data-liangxiang-market-dialog][data-animated=true] .liangxiang-market-whale[data-mood=won] img{animation:liangxiang-market-float 3.5s ease-in-out infinite}
[data-liangxiang-market-dialog][data-animated=true] .liangxiang-market-bubble{animation:liangxiang-market-bubble 3.3s ease-in infinite}
[data-liangxiang-market-dialog][data-animated=false] .liangxiang-market-whale img{transition:none;animation:none}
@keyframes liangxiang-market-float{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-5px) rotate(2deg)}}
@keyframes liangxiang-market-bubble{0%{transform:translateY(7px);opacity:0}25%{opacity:.65}100%{transform:translateY(-20px);opacity:0}}
.liangxiang-market-history{border-top:1px solid ${color.border};padding-top:14px}
.liangxiang-market-receipt{display:grid;grid-template-columns:1fr auto;gap:5px 16px;border-bottom:1px solid ${color.border};padding:12px 0;font-size:12px}
.liangxiang-market-receipt small{font-size:10px;color:${color.textSecondary}}
@media(max-width:720px){.liangxiang-market-batches{grid-template-columns:1fr}.liangxiang-market-batch{padding:12px}.liangxiang-market-position{min-height:64px}.liangxiang-market-header-copy{max-width:calc(100% - 46px)}.liangxiang-market-wallet{flex-wrap:wrap;gap:12px!important}}
@media(prefers-reduced-motion:reduce){[data-liangxiang-market-dialog] *,[data-liangxiang-market-dialog] *::before,[data-liangxiang-market-dialog] *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`

export function MarketDialog({ reducedMotion, online, onClose, session: suppliedSession }: MarketDialogProps): ReactElement {
  const [session] = useState(() => suppliedSession ?? createMarketSession())
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const [animated, setAnimated] = useState(() => readMarketAnimation(browserMarketStorage(), reducedMotion))
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  const [recent, setRecent] = useState(false)
  const [clock, setClock] = useState(() => Date.now())
  const dialog = useRef<HTMLDivElement>(null), clockSync = useRef({ server: 0, received: 0 })
  const lifecycle = useRef({ started: false, disposeTimer: null as number | null })
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.current?.focus()
    const key = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab' || !dialog.current) return
      const items = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]')].filter(el => el.getClientRects().length > 0)
      if (items.length === 0) { event.preventDefault(); dialog.current.focus(); return }
      const first = items[0]!, last = items[items.length - 1]!
      if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement) || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('keydown', key, true); previous?.focus() }
  }, [])
  useEffect(() => {
    // StrictMode's immediate effect replay must not destroy the live session.
    if (lifecycle.current.disposeTimer !== null) window.clearTimeout(lifecycle.current.disposeTimer)
    if (online && !lifecycle.current.started) { lifecycle.current.started = true; void session.start() }
    return () => { lifecycle.current.disposeTimer = window.setTimeout(() => session.dispose(), 0) }
  }, [session, online])
  useEffect(() => {
    const change = (): void => { setVisible(!document.hidden); if (!document.hidden) setClock(Date.now()) }
    document.addEventListener('visibilitychange', change)
    return () => document.removeEventListener('visibilitychange', change)
  }, [])
  useEffect(() => { if (!visible) return; const timer = setInterval(() => setClock(Date.now()), 1_000); return () => clearInterval(timer) }, [visible])
  useEffect(() => { if (view.state) clockSync.current = { server: view.state.server_time, received: Date.now() } }, [view.state])
  const now = clockSync.current.received === 0 ? view.state?.server_time ?? 0 : clockSync.current.server + Math.max(0, clock - clockSync.current.received)
  const state = view.state, market = state?.market
  const animatedNow = animated && visible && !reducedMotion
  return <div data-liangxiang-market-backdrop="" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}
    style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15, 25, 49, .38)', display: 'grid', placeItems: 'center', padding: '12px', pointerEvents: 'auto' }}>
    <style>{CSS}</style>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="liangxiang-market-title" tabIndex={-1}
      data-liangxiang-market-dialog="" data-animated={animatedNow}
      style={{ width: 'min(1060px, 100%)', maxHeight: 'min(900px, calc(100dvh - 24px))', overflow: 'auto', scrollbarWidth: 'thin', background: color.bgLayer, border: `1px solid ${color.border}`, borderRadius: '20px', padding: 'clamp(16px, 3vw, 28px)', boxShadow: '0 24px 90px rgba(10, 25, 65, .26)', outline: 'none' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '18px' }}>
        <div className="liangxiang-market-header-copy"><span style={{ color: 'var(--liangxiang-market-blue)', fontSize: '10px', fontWeight: 700, letterSpacing: '2px' }}>众香成势 · 蓝海开局</span>
          <h2 id="liangxiang-market-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '7px 0 5px', fontSize: '23px', letterSpacing: '.5px' }}><img src={MARKET_WHALE_PATH} alt="" width="32" height="38" decoding="async" />香火交易</h2>
          <p style={{ margin: 0, fontSize: '11px', color: color.textSecondary, lineHeight: 1.6 }}>一天一局，三次定线；押多或押空，收盘一起揭晓。</p></div>
        <button type="button" aria-label="关闭香火交易" onClick={onClose} style={{ border: 0, background: 'transparent', fontSize: '22px', padding: '3px 10px' }}>×</button>
      </header>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div className="liangxiang-market-wallet" style={{ display: 'flex', alignItems: 'baseline', gap: '24px' }} aria-label="服务器累计钱包">
          <span style={{ color: color.textSecondary, fontSize: '11px' }}>可用 <strong data-liangxiang-market-available="" style={{ fontSize: '23px', color: 'var(--liangxiang-market-blue)', margin: '0 4px', fontVariantNumeric: 'tabular-nums' }}>{state?.wallet.available_incense.toLocaleString() ?? '—'}</strong> 炷</span>
          <span style={{ color: color.textSecondary, fontSize: '11px' }}>冻结 <strong data-liangxiang-market-frozen="" style={{ color: color.textPrimary, margin: '0 4px' }}>{state?.wallet.frozen_incense.toLocaleString() ?? '—'}</strong> 炷</span>
          <span style={{ color: color.textSecondary, fontSize: '10px' }}>香火与已到账收益跨日保留</span>
        </div>
        <button type="button" role="switch" aria-checked={animated} aria-label="交易动画" title={reducedMotion ? '系统设置了减少动态，当前静态显示' : '仅影响本窗口的鱼和水波'}
          onClick={() => { writeMarketAnimation(browserMarketStorage(), !animated); setAnimated(!animated) }} style={{ fontSize: '11px', padding: '5px 10px', minHeight: '30px' }}>{reducedMotion ? '— 静态 · 系统减少动态' : animatedNow ? '≈ 动态' : '— 静态'}</button>
      </div>
      {!online && <Notice>社区交易仅在线模式可用，离线香火与社区钱包分别保存。</Notice>}
      {online && view.status === 'loading' && <div style={{ padding: '44px 0', textAlign: 'center', color: color.textSecondary }}><img src={MARKET_WHALE_PATH} alt="" width="80" height="95" /><p>正在读取社区钱包与今日场次…</p></div>}
      {view.error && <Notice><span role="status">{view.error}</span>{view.pending ? <button type="button" disabled={view.sending} onClick={() => { void session.retryPending() }} style={{ marginLeft: '10px', fontSize: '11px' }}>{view.sending ? '核对中…' : '核对上一笔'}</button> : view.status === 'offline' && !view.state && <button type="button" onClick={() => { void session.start() }} style={{ marginLeft: '10px', fontSize: '11px' }}>重新连接</button>}</Notice>}
      {state && online && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '9px', fontSize: '10px', color: color.textSecondary }}>
          <span>{market?.business_date ?? '今日'} · {market?.timezone ?? '服务器时区'} · {view.status === 'live' ? '已连接' : '连接恢复中'}</span>
          <div style={{ display: 'flex', gap: '4px' }}><button type="button" data-selected={!recent} onClick={() => setRecent(false)} style={{ minHeight: '25px', padding: '2px 8px', fontSize: '10px' }}>全天</button><button type="button" data-selected={recent} onClick={() => setRecent(true)} style={{ minHeight: '25px', padding: '2px 8px', fontSize: '10px' }}>近四小时</button></div>
        </div>
        <MarketChart state={state} candles={view.candles} animated={animatedNow} recent={recent} />
        {view.chartError && <p style={{ color: color.textSecondary, fontSize: '10px' }}>{view.chartError}</p>}
        {!market && <Notice>今日交易场次尚未建立，正常上香不受影响。</Notice>}
        {market && <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', padding: '16px 0 12px', fontSize: '11px', color: color.textSecondary }}><span>投入 → 锁仓立线 → 持仓打梁 → 收盘分池</span><span>{market.status === 'open' ? `共同收盘 ${marketTime(market.closes_at, market.timezone)}` : market.status === 'cancelled' ? '本场已取消，资金按回执退回' : '本场已收盘'}</span></div>
          <div className="liangxiang-market-batches">{market.batches.map(batch => <BatchCard key={`${market.id}:${batch.batch}`} batch={batch} state={state} now={now} pending={view.sending || view.pending !== null || view.status !== 'live'}
            onSet={(side, amount) => { void session.submit({ market_id: market.id, batch: batch.batch, side, amount }).catch(() => undefined) }} />)}</div>
        </>}
        <details style={{ margin: '15px 0 18px', color: color.textSecondary, fontSize: '11px', lineHeight: 1.8 }}><summary style={{ cursor: 'pointer' }}>玩法与信任说明</summary>
          <p>多：收盘梁位高于本批参考线时获胜；空：低于参考线时获胜。赢家按投入分走本批输方香火，余香按公开整数规则分配；持平或本批不成立时退款。</p>
          <p>定线前，多方希望参考线低、空方希望参考线高；定线后再争共同收盘梁位。开仓不自动投票，冻结香火不能上香，也不能重复投入。</p>
          <p>这是社区软信任玩法：用量由本机申报，参与者可以组织上香影响梁位。参考线之间允许独立换向；当前占优和预计返还均不是已到账收益。</p>
        </details>
      </>}
      {online && state && <section className="liangxiang-market-history" aria-label="我的结算回执"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}><h3 style={{ margin: 0, fontSize: '13px' }}>我的收盘回执</h3><span style={{ color: color.textSecondary, fontSize: '10px' }}>每次读取 20 条 · 缓存可清理</span></div>
        {view.receipts.length === 0 && <p style={{ color: color.textSecondary, fontSize: '11px', margin: '16px 0' }}>{view.historyLoading ? '正在读取回执…' : '还没有已结算记录，收盘后会出现在这里。'}</p>}
        {view.receipts.map(receipt => <Receipt key={receipt.id} receipt={receipt} />)}
        {view.nextCursor && <button type="button" onClick={() => { void session.loadHistory(true) }} disabled={view.historyLoading} style={{ marginTop: '12px', fontSize: '11px' }}>{view.historyLoading ? '读取中…' : '查看更早回执'}</button>}
      </section>}
    </div>
  </div>
}

function Notice({ children }: { children: ReactNode }): ReactElement {
  return <div style={{ borderRadius: '10px', background: `color-mix(in srgb, #729efb 9%, ${color.bgLayer})`, padding: '10px 13px', margin: '10px 0', color: color.textSecondary, fontSize: '11px', lineHeight: 1.7 }}>{children}</div>
}

function BatchCard({ batch, state, now, pending, onSet }: { batch: MarketBatch, state: MarketState, now: number, pending: boolean, onSet(side: MarketSide | null, amount: number): void }): ReactElement {
  const [side, setSide] = useState<MarketSide>(batch.position?.side ?? 'long')
  const [amount, setAmount] = useState(String(batch.position?.amount ?? 5))
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) { setSide(batch.position?.side ?? 'long'); setAmount(String(batch.position?.amount ?? 5)) } }, [batch.position?.side, batch.position?.amount, editing])
  const timezone = state.market?.timezone ?? 'UTC'
  const editable = batch.status === 'open' && now < batch.locks_at && state.market?.status === 'open'
  const value = Number(amount), maxAmount = state.wallet.available_incense + (batch.position?.amount ?? 0)
  const invalid = !Number.isSafeInteger(value) || value < 1 || value > Math.min(MARKET_AMOUNT_MAX, maxAmount)
  const countdown = Math.max(0, batch.locks_at - now)
  const status = batch.status === 'pending' ? `${marketTime(batch.opens_at, timezone)} 开放投入` : batch.status === 'open' ? `距锁仓 ${Math.floor(countdown / 3_600_000)}时${Math.floor(countdown / 60_000) % 60}分` : batch.status === 'locked' ? '已锁仓 · 争参考线' : batch.status === 'live' ? '已定线 · 持仓对抗' : batch.status === 'void' ? '本批取消 · 本金已退回' : '已结算'
  const total = batch.long_incense + batch.short_incense
  const mood = positionMood(batch, state.market?.close_point ?? state.current_point)
  const moodCopy = { waiting: batch.reference === null ? '等待参考线' : '暂未投入', ahead: '当前占优', behind: '暂时落后', even: '当前持平', won: '本批获胜', lost: '本批未中', returned: '本金已退回' }[mood]
  const payout = expectedReturn(batch, state.market?.close_point ?? state.current_point)
  return <article className="liangxiang-market-batch" data-status={batch.status} data-liangxiang-market-batch={batch.batch}>
    <div className="liangxiang-market-batch-head"><h3>P{batch.batch} · {['早盘', '午盘', '晚盘'][batch.batch - 1]}</h3><span style={{ color: 'var(--liangxiang-market-blue)', fontSize: '10px' }}>{status}</span></div>
    <p>投入至 {marketTime(batch.locks_at, timezone)} · {marketTime(batch.reference_at, timezone)} 定线</p>
    <p>参考梁位 <strong style={{ color: color.textPrimary, fontVariantNumeric: 'tabular-nums' }}>{marketRatioLabel(pointRatio(batch.reference))}</strong></p>
    <div className="liangxiang-market-pool" aria-hidden="true"><span style={{ width: `${total ? batch.long_incense / total * 100 : 50}%`, background: '#5f83ec' }} /><span style={{ flex: 1, background: '#9bb8e7' }} /></div>
    <p style={{ display: 'flex', justifyContent: 'space-between' }}><span>多池 {batch.long_incense.toLocaleString()} 炷</span><span>空池 {batch.short_incense.toLocaleString()} 炷</span></p>
    {batch.position && <div className="liangxiang-market-position"><MarketWhale batch={batch} state={state} /><span><strong>{sideLabel(batch.position.side)} {batch.position.amount} 炷 · {moodCopy}</strong>
      <small>{payout === null ? '定线后显示当前胜负' : batch.position.payout !== null ? `本批已返还 ${payout} 炷` : `若此刻收盘，预计返还 ${payout} 炷`}</small><small>{batch.position.payout !== null ? '本批结果已封存' : '本金已冻结，实际结果以收盘为准'}</small></span></div>}
    {editable ? <form onSubmit={event => { event.preventDefault(); if (!invalid && !pending) { setEditing(false); onSet(side, value) } }}>
      <div className="liangxiang-market-direction" role="group" aria-label={`P${batch.batch} 仓位方向`}><button type="button" aria-pressed={side === 'long'} data-selected={side === 'long'} disabled={pending} onClick={() => { setSide('long'); setEditing(true) }}>↗ 做多</button><button type="button" aria-pressed={side === 'short'} data-selected={side === 'short'} disabled={pending} onClick={() => { setSide('short'); setEditing(true) }}>↘ 做空</button></div>
      <label className="liangxiang-market-amount"><span style={{ whiteSpace: 'nowrap', fontSize: '11px', color: color.textSecondary }}>总投入</span><input type="number" inputMode="numeric" min="1" max={Math.min(MARKET_AMOUNT_MAX, maxAmount)} step="1" value={amount} disabled={pending} aria-label={`P${batch.batch} 总投入香火`} onChange={event => { setAmount(event.target.value); setEditing(true) }} /><span style={{ fontSize: '11px' }}>炷</span></label>
      <div className="liangxiang-market-quick">{[5, 10, 20].map(n => <button key={n} type="button" disabled={pending || value + n > Math.min(MARKET_AMOUNT_MAX, maxAmount)} onClick={() => { setAmount(String((Number.isSafeInteger(value) ? value : 0) + n)); setEditing(true) }}>+{n}</button>)}</div>
      <div style={{ display: 'flex', gap: '6px' }}><button className="liangxiang-market-primary" type="submit" disabled={invalid || pending} style={{ flex: 1 }}>{pending ? '确认中…' : batch.position ? '确认调整' : '确认投入'}</button>{batch.position && <button type="button" disabled={pending} onClick={() => { setEditing(false); onSet(null, 0) }}>撤回</button>}</div>
      {invalid && <p style={{ fontSize: '10px' }}>请输入可用范围内的整炷香火，冻结额不可重复使用。</p>}
      <p style={{ fontSize: '10px' }}>提交即预冻结；封盘前可调整或撤回。</p>
    </form> : !batch.position && <p style={{ padding: '14px 0', textAlign: 'center' }}>{batch.status === 'pending' ? '可以留出香火，稍后再做选择。' : '本批未持仓，仍可通过上香参与走势。'}</p>}
  </article>
}

function Receipt({ receipt }: { receipt: MarketReceipt }): ReactElement {
  return <details className="liangxiang-market-receipt"><summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '16px', gridColumn: '1 / -1' }}><span>{receipt.business_date} <small>投入 {receipt.invested_incense} · 返还 {receipt.returned_incense}</small></span><strong style={{ color: receipt.pnl_incense >= 0 ? 'var(--liangxiang-market-blue)' : color.textSecondary }}>{receipt.pnl_incense > 0 ? '+' : ''}{receipt.pnl_incense} 炷</strong></summary>
    <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: color.textSecondary, lineHeight: 1.9 }}>{receipt.batches.map(batch => <div key={batch.batch}>P{batch.batch} · {sideLabel(batch.side)} {batch.amount} 炷 → 返还 {batch.payout} 炷{batch.result === 'void' || batch.result === 'draw' ? '（退回）' : ''}</div>)}</div>
  </details>
}
