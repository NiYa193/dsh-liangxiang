import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react'
import { MARKET_AMOUNT_MAX, type MarketBatch, type MarketBatchId, type MarketReceipt, type MarketSide, type MarketState } from '../../shared/market-v1.ts'
import { createMarketSession, type MarketSession } from './market-client.ts'
import { browserMarketStorage, readMarketAnimation, writeMarketAnimation } from './market-cache.ts'
import { expectedReturn, marketRatioLabel, marketTime, pointRatio, positionMood, sideLabel } from './chart-model.ts'
import { MarketChart } from './MarketChart.tsx'
import { MARKET_DIALOG_CSS } from './market-style.ts'

export interface MarketDialogProps {
  reducedMotion: boolean
  online: boolean
  onClose(): void
  session?: MarketSession
  presentation?: { caseId: string, policyId: string, title: string }
}

function preferredBatch(state: MarketState | null): MarketBatchId {
  const batches = state?.market?.batches ?? []
  return batches.find(batch => batch.status === 'open')?.batch
    ?? [...batches].reverse().find(batch => batch.position !== null)?.batch ?? 1
}
function stageCaption(batch: MarketBatch): string {
  if (batch.status === 'open') return '可投入'
  if (batch.status === 'locked') return '争参考线'
  if (batch.status === 'live') return batch.position ? `${sideLabel(batch.position.side)} ${batch.position.amount} 炷` : '已定线'
  if (batch.status === 'pending') return '待开放'
  return batch.status === 'void' ? '已退回' : '已结算'
}

export function MarketDialog({ reducedMotion, online, onClose, session: suppliedSession, presentation }: MarketDialogProps): ReactElement {
  const [session] = useState(() => suppliedSession ?? createMarketSession())
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const [animated, setAnimated] = useState(() => readMarketAnimation(browserMarketStorage(), reducedMotion))
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  const [recent, setRecent] = useState(false)
  const [clock, setClock] = useState(() => Date.now())
  const [selection, setSelection] = useState(() => ({ marketId: view.state?.market?.id ?? '', batch: preferredBatch(view.state) }))
  const dialog = useRef<HTMLDivElement>(null), clockSync = useRef({ server: 0, received: 0 })
  const lifecycle = useRef({ started: false, disposeTimer: null as number | null })
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.current?.focus()
    const key = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return }
      if (event.key !== 'Tab' || !dialog.current) return
      const items = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, [tabindex="0"]')].filter(el => {
        if (el.tabIndex < 0 || el.getClientRects().length === 0 || el.closest('[hidden]')) return false
        // Closed details can retain layout boxes for their skipped contents.
        // Only their own summary belongs to the actual keyboard sequence.
        for (let parent = el.parentElement; parent && parent !== dialog.current; parent = parent.parentElement) {
          if (parent.tagName === 'DETAILS' && !parent.hasAttribute('open') && !parent.querySelector(':scope > summary')?.contains(el)) return false
        }
        return true
      })
      if (items.length === 0) { event.preventDefault(); dialog.current.focus(); return }
      const first = items[0]!, last = items[items.length - 1]!
      if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement) || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.current.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('keydown', key, true); previous?.focus() }
  }, [])
  useEffect(() => {
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
  const casePresentation = presentation?.caseId === market?.case_id ? presentation : undefined
  const selected = selection.marketId === market?.id ? selection.batch : preferredBatch(state)
  const select = (batch: MarketBatchId): void => setSelection({ marketId: market?.id ?? '', batch })
  const animatedNow = animated && visible && !reducedMotion
  return <div data-liangxiang-market-backdrop="" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}
    style={{ position: 'fixed', inset: 0, zIndex: 1200, backgroundColor: 'rgba(12, 24, 46, .38)', display: 'grid', placeItems: 'center', padding: '12px', pointerEvents: 'auto' }}>
    <style>{MARKET_DIALOG_CSS}</style>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="liangxiang-market-title" tabIndex={-1} data-liangxiang-market-dialog="" data-animated={animatedNow}>
      <header className="liangxiang-market-header">
        <div className="liangxiang-market-header-copy"><h2 id="liangxiang-market-title">香火交易</h2><p>{casePresentation?.title ?? '三次定线 · 午夜一起揭晓'}</p></div>
        <div className="liangxiang-market-wallet" aria-label="服务器累计钱包" title="可用与已到账收益跨日保留；冻结香火不能重复投入或上香">
          <span>可用<strong data-liangxiang-market-available="">{state?.wallet.available_incense.toLocaleString() ?? '—'}</strong>炷</span>
          <span>冻结<strong data-liangxiang-market-frozen="">{state?.wallet.frozen_incense.toLocaleString() ?? '—'}</strong>炷</span>
        </div>
        <button className="liangxiang-market-motion" type="button" role="switch" aria-checked={animated} aria-label="交易动画"
          title={reducedMotion ? '系统设置了减少动态，当前静态显示' : '仅影响本窗口的鱼和水波'}
          onClick={() => { writeMarketAnimation(browserMarketStorage(), !animated); setAnimated(!animated) }}>{reducedMotion ? '静态 · 系统减少动态' : animatedNow ? '≈ 动态' : '— 静态'}</button>
        <button className="liangxiang-market-close" type="button" aria-label="关闭香火交易" onClick={onClose}>×</button>
      </header>
      {!online && <Notice>社区交易仅在线模式可用，离线香火与社区钱包分别保存。</Notice>}
      {online && view.status === 'loading' && <p className="liangxiang-market-idle" style={{ padding: '70px 0', textAlign: 'center' }}>正在唤醒大肥鱼…</p>}
      {view.error && <Notice><span role="status">{view.error}</span>{view.pending ? <button type="button" disabled={view.sending} onClick={() => { void session.retryPending() }}>{view.sending ? '核对中…' : '核对上一笔'}</button> : view.status === 'offline' && !view.state && <button type="button" onClick={() => { void session.start() }}>重新连接</button>}</Notice>}
      {state && online && <>
        <MarketChart state={state} candles={view.candles} animated={animatedNow} recent={recent} selectedBatch={selected} {...(casePresentation === undefined ? {} : { liangziPolicyId: casePresentation.policyId })} />
        {view.chartError && <p className="liangxiang-market-idle">{view.chartError}</p>}
        {!market && <Notice>今日交易尚未开场，正常上香不受影响。</Notice>}
        {market && <>
          <div className="liangxiang-market-stage-tabs" role="tablist" aria-label="三次入场">
            {market.batches.map(batch => <button key={batch.batch} type="button" role="tab" id={`liangxiang-market-tab-${batch.batch}`}
              aria-selected={selected === batch.batch} aria-controls={`liangxiang-market-stage-${batch.batch}`} tabIndex={selected === batch.batch ? 0 : -1}
              onClick={() => select(batch.batch)} onKeyDown={event => {
                const next = event.key === 'ArrowRight' ? batch.batch % 3 + 1 : event.key === 'ArrowLeft' ? (batch.batch + 1) % 3 + 1 : event.key === 'Home' ? 1 : event.key === 'End' ? 3 : null
                if (next !== null) { event.preventDefault(); select(next as MarketBatchId); document.getElementById(`liangxiang-market-tab-${next}`)?.focus() }
              }}><strong>P{batch.batch} · {['早盘', '午盘', '晚盘'][batch.batch - 1]}</strong><small>{stageCaption(batch)}</small></button>)}
          </div>
          {market.batches.map(batch => <section key={`${market.id}:${batch.batch}`} role="tabpanel" id={`liangxiang-market-stage-${batch.batch}`} aria-labelledby={`liangxiang-market-tab-${batch.batch}`} hidden={selected !== batch.batch}>
            <BatchCard batch={batch} state={state} now={now} pending={view.sending || view.pending !== null || view.status !== 'live'} onInteract={() => select(batch.batch)}
              onSet={(side, amount) => { void session.submit({ market_id: market.id, batch: batch.batch, side, amount }).catch(() => undefined) }} />
          </section>)}
        </>}
        <footer className="liangxiang-market-footer">
          <details className="liangxiang-market-history" aria-label="我的结算回执"><summary>我的收盘回执{view.receipts.length ? ` · ${view.receipts.length}` : ''}</summary>
            {view.receipts.length === 0 && <p>{view.historyLoading ? '正在读取…' : '第一份回执，收盘后见。'}</p>}
            {view.receipts.map(receipt => <Receipt key={receipt.id} receipt={receipt} />)}
            {view.nextCursor && <button type="button" onClick={() => { void session.loadHistory(true) }} disabled={view.historyLoading}>{view.historyLoading ? '读取中…' : '更早回执'}</button>}
          </details>
          <details className="liangxiang-market-rules"><summary>玩法与设置</summary>
            <p>做多盼收盘高于本批参考线，做空盼低于参考线。赢家按投入分走本批输方香火，整炷分配；持平或本批不成立时退款。</p>
            <p>定线前争参考线，定线后争午夜收盘。三批独立，可选不同方向；投入即冻结，封盘前可调整或撤回。</p>
            <p>持仓定线后，鱼在水面上表示当前占优，潜水表示暂时落后。预计返还按此刻收盘试算，不是已到账收益。</p>
            <p>社区软信任：用量由本机申报，大家可以组织上香影响梁位。钱包与结算由服务器记账。</p>
            <button type="button" aria-pressed={recent} data-selected={recent} onClick={() => setRecent(!recent)}>{recent ? '显示全天' : '只看近四小时'}</button>
          </details>
          <span className="liangxiang-market-connection" title={`${market?.business_date ?? ''} · ${market?.timezone ?? '服务器时区'}`}><i />{view.status === 'live' ? market?.status === 'open' ? '午夜揭晓' : market?.status === 'cancelled' ? '已取消 · 已退款' : '已收盘' : '正在重连'}</span>
        </footer>
      </>}
    </div>
  </div>
}

function Notice({ children }: { children: ReactNode }): ReactElement { return <div className="liangxiang-market-notice">{children}</div> }

function BatchCard({ batch, state, now, pending, onSet, onInteract }: { batch: MarketBatch, state: MarketState, now: number, pending: boolean, onSet(side: MarketSide | null, amount: number): void, onInteract(): void }): ReactElement {
  const [side, setSide] = useState<MarketSide>(batch.position?.side ?? 'long')
  const [amount, setAmount] = useState(String(batch.position?.amount ?? 5))
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) { setSide(batch.position?.side ?? 'long'); setAmount(String(batch.position?.amount ?? 5)) } }, [batch.position?.side, batch.position?.amount, editing])
  const timezone = state.market?.timezone ?? 'UTC'
  const editable = batch.status === 'open' && now < batch.locks_at && state.market?.status === 'open'
  const value = Number(amount), maxAmount = state.wallet.available_incense + (batch.position?.amount ?? 0)
  const invalid = !Number.isSafeInteger(value) || value < 1 || value > Math.min(MARKET_AMOUNT_MAX, maxAmount)
  const countdown = Math.max(0, batch.locks_at - now)
  const status = batch.status === 'pending' ? `${marketTime(batch.opens_at, timezone)} 开放` : batch.status === 'open' ? `${marketTime(batch.locks_at, timezone)} 封盘 · 还剩 ${Math.floor(countdown / 3_600_000)}时${Math.floor(countdown / 60_000) % 60}分` : batch.status === 'locked' ? `${marketTime(batch.reference_at, timezone)} 定线 · 现在可上香争参考线` : batch.status === 'live' ? '已定线 · 上香争收盘' : batch.status === 'void' ? '本批取消 · 本金已退回' : '本批已结算'
  const mood = positionMood(batch, state.market?.close_point ?? state.current_point)
  const moodCopy = { waiting: '等待参考线', ahead: '当前占优', behind: '暂时落后', even: '当前持平', won: '本批获胜', lost: '本批未中', returned: '本金已退回' }[mood]
  const payout = expectedReturn(batch, state.market?.close_point ?? state.current_point)
  return <article className="liangxiang-market-batch" data-status={batch.status} data-liangxiang-market-batch={batch.batch} onFocusCapture={onInteract} onPointerDown={onInteract}>
    <div className="liangxiang-market-batch-meta"><p>{status}{batch.reference && <> · 参考 {marketRatioLabel(pointRatio(batch.reference))}</>}</p>
      <details className="liangxiang-market-pool-info"><summary>香池 {(batch.long_incense + batch.short_incense).toLocaleString()} 炷 ⌄</summary><div className="liangxiang-market-pool-detail">多池 {batch.long_incense.toLocaleString()} 炷<br />空池 {batch.short_incense.toLocaleString()} 炷</div></details>
    </div>
    {batch.position && <div className="liangxiang-market-position"><strong>{sideLabel(batch.position.side)} {batch.position.amount} 炷</strong><span data-mood={mood}>{moodCopy}</span>
      <small>{payout === null ? '定线后看胜负' : batch.position.payout !== null ? `已返还 ${payout} 炷` : `若此刻收盘，预计返还 ${payout} 炷`}</small></div>}
    {editable ? <form onSubmit={event => { event.preventDefault(); if (!invalid && !pending) { setEditing(false); onSet(side, value) } }}>
      <div className="liangxiang-market-order"><div className="liangxiang-market-direction" role="group" aria-label={`P${batch.batch} 仓位方向`}>
        <button type="button" aria-pressed={side === 'long'} disabled={pending} onClick={() => { setSide('long'); setEditing(true) }}><span className="liangxiang-market-button-face">↗ 做多</span></button>
        <button type="button" aria-pressed={side === 'short'} disabled={pending} onClick={() => { setSide('short'); setEditing(true) }}><span className="liangxiang-market-button-face">↘ 做空</span></button>
      </div>
      <label className="liangxiang-market-amount"><span>投入</span><input type="number" inputMode="numeric" min="1" max={Math.min(MARKET_AMOUNT_MAX, maxAmount)} step="1" value={amount} disabled={pending} aria-label={`P${batch.batch} 总投入香火`} onChange={event => { setAmount(event.target.value); setEditing(true) }} /><span>炷</span></label>
      <button className="liangxiang-market-primary" type="submit" disabled={invalid || pending}><span className="liangxiang-market-button-face">{pending ? '确认中…' : batch.position ? '确认调整' : '确认投入'}</span></button>
      {batch.position && <button className="liangxiang-market-withdraw" type="button" disabled={pending} onClick={() => { setEditing(false); onSet(null, 0) }}>撤回</button>}</div>
      <p className="liangxiang-market-order-hint">{invalid ? '请输入可用范围内的整炷香火。' : `投入即冻结 · ${marketTime(batch.locks_at, timezone)} 前可调整或撤回 · ${marketTime(batch.reference_at, timezone)} 定线`}</p>
    </form> : !batch.position && <p className="liangxiang-market-idle">{batch.status === 'pending' ? `${marketTime(batch.opens_at, timezone)} 再来，大肥鱼等你。` : '本批未持仓，也可以上香参与走势。'}</p>}
  </article>
}

function Receipt({ receipt }: { receipt: MarketReceipt }): ReactElement {
  return <details className="liangxiang-market-receipt"><summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '12px' }}><span>{receipt.business_date} <small>投入 {receipt.invested_incense} · 返还 {receipt.returned_incense}</small></span><strong style={{ color: receipt.pnl_incense >= 0 ? 'var(--liangxiang-market-blue-text)' : 'var(--liangxiang-market-sub)' }}>{receipt.pnl_incense > 0 ? '+' : ''}{receipt.pnl_incense} 炷</strong></summary>
    <div style={{ fontSize: '10px', color: 'var(--liangxiang-market-sub)', lineHeight: 1.9 }}>{receipt.batches.map(batch => <div key={batch.batch}>P{batch.batch} · {sideLabel(batch.side)} {batch.amount} 炷 → 返还 {batch.payout} 炷{batch.result === 'void' || batch.result === 'draw' ? '（退回）' : ''}</div>)}</div>
  </details>
}
