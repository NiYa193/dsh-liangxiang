import { marketClass } from './market-motion-style.ts'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import { MARKET_AMOUNT_MAX, type MarketBatch, type MarketBatchId, type MarketReceipt, type MarketSide, type MarketState } from '../../shared/market-v1.ts'
import { createMarketSession, type MarketSession } from './market-client.ts'
import { browserMarketStorage, readMarketAnimation, writeMarketAnimation } from './market-cache.ts'
import { expectedReturn, marketTime, positionMood, sideLabel } from './chart-model.ts'
import { MarketChart } from './MarketChart.tsx'
import { MarketFishCompanion, type FishAction, type FishReaction } from './MarketFishCompanion.tsx'
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

function batchReport(batch: MarketBatch, state: MarketState, now: number): string {
  const timezone = state.market?.timezone ?? 'UTC'
  const minutes = Math.max(0, Math.ceil((batch.locks_at - now) / 60_000))
  const clock = batch.status === 'open' ? `${marketTime(batch.locks_at, timezone)}封盘 · 余${Math.floor(minutes / 60)}时${minutes % 60}分`
    : batch.status === 'pending' ? `${marketTime(batch.opens_at, timezone)}开放 · ${marketTime(batch.reference_at, timezone)}定线`
    : batch.status === 'locked' ? `${marketTime(batch.reference_at, timezone)}定线，快去打梁～`
    : batch.status === 'live' ? `${marketTime(batch.reference_at, timezone)}已定线 · 午夜比高低`
    : batch.status === 'void' ? '本盘已取消，本金已退回。' : '本盘已结算，回执里见。'
  return `${clock}\n香池${(batch.long_incense + batch.short_incense).toLocaleString()}炷 · 多${batch.long_incense.toLocaleString()} / 空${batch.short_incense.toLocaleString()}`
}

export function MarketDialog({ reducedMotion, online, onClose, session: suppliedSession, presentation }: MarketDialogProps): ReactElement {
  const [session] = useState(() => suppliedSession ?? createMarketSession())
  const view = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  const [animated, setAnimated] = useState(() => readMarketAnimation(browserMarketStorage(), reducedMotion))
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  const [fullscreen, setFullscreen] = useState(false)
  const [popover, setPopover] = useState<'history' | 'rules' | null>(null)
  const [fishReaction, setFishReaction] = useState<FishReaction | null>(null)
  const fishSerial = useRef(0)
  const reactFish = (action: FishAction, text?: string, deliberate = false): void => setFishReaction({ id: ++fishSerial.current, action, deliberate, ...(text === undefined ? {} : { text }) })
  const reportMinute = useRef('')
  const popoverRef = useRef(popover); popoverRef.current = popover
  const [clock, setClock] = useState(() => Date.now())
  const [selection, setSelection] = useState(() => ({ marketId: view.state?.market?.id ?? '', batch: preferredBatch(view.state) }))
  const dialog = useRef<HTMLDivElement>(null), clockSync = useRef({ server: 0, received: 0 })
  const lifecycle = useRef({ started: false, disposeTimer: null as number | null })
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.current?.focus()
    const key = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        if (popoverRef.current === null && event.target instanceof Element && event.target.closest('[data-liangxiang-market-pinned="true"]')) return
        event.preventDefault(); event.stopPropagation()
        if (popoverRef.current) {
          const target = popoverRef.current
          setPopover(null)
          dialog.current?.querySelector<HTMLButtonElement>(`[data-liangxiang-market-popover-trigger="${target}"]`)?.focus()
        } else closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog.current) return
      const items = [...dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter(el => {
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
  const selectAndReport = (batch: MarketBatchId): void => {
    select(batch)
    reportMinute.current = `${market?.id}:${batch}:${Math.floor(now / 60_000)}`
    const selectedBatch = market?.batches.find(item => item.batch === batch)
    if (selectedBatch && state) reactFish(`batch${batch}` as FishAction, batchReport(selectedBatch, state, now))
  }
  const animatedNow = animated && visible && !reducedMotion
  const shownBatch = market?.batches.find(batch => batch.batch === selected)
  const fishMood = shownBatch ? positionMood(shownBatch, market?.close_point ?? state?.current_point ?? null) : 'waiting'
  useEffect(() => {
    if (!visible || !online || !shownBatch || !state || view.status !== 'live' || view.error) return
    const key = `${market?.id}:${selected}:${Math.floor(now / 60_000)}`
    if (reportMinute.current === key) return
    const first = reportMinute.current === ''
    reportMinute.current = key
    if (!first) reactFish('periodic', batchReport(shownBatch, state, now))
  }, [visible, online, shownBatch, state, view.status, view.error, market?.id, selected, Math.floor(now / 60_000)])
  return <div data-liangxiang-market-backdrop="" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}
    style={{ position: 'fixed', inset: 0, zIndex: 1200, backgroundColor: 'rgba(12, 24, 46, .38)', display: 'grid', placeItems: 'center', padding: '12px', pointerEvents: 'auto' }}>
    <style>{MARKET_DIALOG_CSS}</style>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="liangxiang-market-title" tabIndex={-1} data-liangxiang-market-dialog="" data-animated={animatedNow} data-fullscreen={fullscreen}
      onClickCapture={event => {
        if (!(event.target instanceof Element)) return
        const button = event.target.closest<HTMLButtonElement>('button')
        const action = button?.dataset.fishAction as FishAction | undefined
        if (action === 'motion') reactFish('motion', reducedMotion ? '系统要安静，鱼干也陪你看～' : button?.getAttribute('aria-checked') === 'true' ? '尾巴收好，大鱼干休假～' : undefined)
        else if (action) reactFish(action)
      }}
      onPointerDownCapture={event => { if (event.target instanceof Element && !event.target.closest('[data-liangxiang-market-popover], [data-liangxiang-market-popover-trigger]')) setPopover(null) }}>
      <header className={marketClass('header')}>
        <div className={marketClass('header-copy')}>
        <h2 id="liangxiang-market-title" aria-label="梁股 · 香火市场"><span>梁股</span><i aria-hidden="true" /><small>香火市场</small></h2>
        <div className={marketClass('wallet')} aria-label="服务器累计钱包" title="可用与已到账收益跨日保留；冻结香火不能重复投入或上香">
          <span>可用<strong data-liangxiang-market-available="">{state?.wallet.available_incense.toLocaleString() ?? '—'}</strong>炷</span>
          <span>冻结<strong data-liangxiang-market-frozen="">{state?.wallet.frozen_incense.toLocaleString() ?? '—'}</strong>炷</span>
        </div>
        </div>
        <button type="button" className={marketClass('companion-trigger')} aria-label="大肥鱼：播报本盘香池与时间" aria-description={shownBatch && state ? batchReport(shownBatch, state, now) : undefined} onClick={() => { if (shownBatch && state) reactFish('report', batchReport(shownBatch, state, now)) }}>
          <MarketFishCompanion mood={fishMood} animated={animatedNow} visible={visible} reaction={fishReaction} />
        </button>
        <div className={marketClass('window-controls')}>
        <button className={marketClass('motion')} type="button" role="switch" aria-checked={animated} aria-label="交易动画" data-fish-action="motion"
          title={reducedMotion ? '系统设置了减少动态，当前静态显示' : '仅影响本窗口的鱼和水波'}
          onClick={() => { writeMarketAnimation(browserMarketStorage(), !animated); setAnimated(!animated) }}><span aria-hidden="true" className={animatedNow ? '' : 'liangxiang-market-dried-fish'}>🐟</span><span>{animatedNow ? '动态' : '鱼干'}</span></button>
        <button className={marketClass('fullscreen')} type="button" data-fish-action={fullscreen ? 'restore' : 'fullscreen'} data-liangxiang-market-fullscreen="" aria-label={fullscreen ? '退出全屏香火交易' : '全屏香火交易'} aria-pressed={fullscreen} onClick={() => setFullscreen(!fullscreen)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d={fullscreen ? 'M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5' : 'M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5'} /></svg></button>
        <button className={marketClass('close')} type="button" aria-label="关闭香火交易" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
        </div>
      </header>
      <span className={marketClass('a11y')} aria-live="polite">{fishReaction?.action === 'confirmed' ? fishReaction.text : ''}</span>
      <div className={marketClass('status')} role="status" aria-live="polite">
        {!online ? '社区交易仅在线模式可用，离线香火与社区钱包分别保存。' : view.error ?? view.chartError ?? ''}
        {online && view.error && (view.pending ? <button type="button" disabled={view.sending} onClick={() => { void session.retryPending() }}>{view.sending ? '核对中…' : '核对上一笔'}</button> : view.status === 'offline' && !view.state && <button type="button" onClick={() => { void session.start() }}>重新连接</button>)}
      </div>
      {online && view.status === 'loading' && <p className={marketClass('loading')}>正在唤醒大肥鱼…</p>}
      {state && online && <>
        <MarketChart state={state} candles={view.candles} candlesIntervalMs={view.candleIntervalMs ?? 300_000} animated={animatedNow} selectedBatch={selected} onInteraction={(action, gesture) => reactFish(action ?? 'inspect', undefined, !gesture)} {...(casePresentation === undefined ? {} : { liangziPolicyId: casePresentation.policyId })} />
        {!market && <p className={marketClass('empty')}>今日交易尚未开场，正常上香不受影响。</p>}
        {market && <>
          <div className={marketClass('stage-tabs')} role="tablist" aria-label="三次入场">
            {market.batches.map(batch => <button key={batch.batch} type="button" role="tab" id={`liangxiang-market-tab-${batch.batch}`}
              aria-selected={selected === batch.batch} aria-controls={`liangxiang-market-stage-${batch.batch}`} tabIndex={selected === batch.batch ? 0 : -1}
              onClick={() => selectAndReport(batch.batch)} onKeyDown={event => {
                const next = event.key === 'ArrowRight' ? batch.batch % 3 + 1 : event.key === 'ArrowLeft' ? (batch.batch + 1) % 3 + 1 : event.key === 'Home' ? 1 : event.key === 'End' ? 3 : null
                if (next !== null) { event.preventDefault(); selectAndReport(next as MarketBatchId); document.getElementById(`liangxiang-market-tab-${next}`)?.focus() }
              }}><span className={marketClass('button-face')}><strong><span className={marketClass('batch-number')}>P{batch.batch}</span>{marketTime(batch.reference_at, market.timezone)}</strong><small>{stageCaption(batch)}</small></span></button>)}
          </div>
          {market.batches.map(batch => <section className={marketClass('stage')} key={`${market.id}:${batch.batch}`} role="tabpanel" id={`liangxiang-market-stage-${batch.batch}`} aria-labelledby={`liangxiang-market-tab-${batch.batch}`} hidden={selected !== batch.batch}>
            <BatchCard batch={batch} state={state} now={now} pending={view.sending || view.pending !== null || view.status !== 'live'} onInteract={() => select(batch.batch)} onDraft={() => reactFish('amount')}
              onSet={(side, amount) => {
                reactFish(side === null ? 'withdraw' : 'submit')
                void session.submit({ market_id: market.id, batch: batch.batch, side, amount }).then(() => {
                  const receipt = session.getSnapshot()
                  const confirmed = receipt.error === null && receipt.pending === null && receipt.status === 'live'
                  const actual = receipt.state?.market?.batches.find(item => item.batch === batch.batch)
                  const payout = actual && receipt.state ? expectedReturn(actual, receipt.state.market?.close_point ?? receipt.state.current_point) : null
                  const text = confirmed ? actual?.position ? `已确认${sideLabel(actual.position.side)}${actual.position.amount.toLocaleString()}炷。${payout === null ? '等本盘定线，再看高低～' : `若此刻收盘，预计返还${payout.toLocaleString()}炷。`}` : '仓位已撤回，香火回到可用余额。' : receipt.error ?? '这笔尚未确认，先核对原请求。'
                  reactFish(confirmed ? 'confirmed' : 'error', text)
                }, () => reactFish('error'))
              }} />
          </section>)}
        </>}
        <footer className={marketClass('footer')}>
          <button type="button" data-fish-action="history" data-liangxiang-market-popover-trigger="history" aria-expanded={popover === 'history'} aria-controls="liangxiang-market-history" onClick={() => setPopover(popover === 'history' ? null : 'history')}><span aria-hidden="true">▤ </span>我的回执</button>
          <button type="button" data-fish-action="rules" data-liangxiang-market-popover-trigger="rules" aria-expanded={popover === 'rules'} aria-controls="liangxiang-market-rules" onClick={() => setPopover(popover === 'rules' ? null : 'rules')}><span aria-hidden="true">ⓘ </span>玩法</button>
          <section id="liangxiang-market-history" className={marketClass('popover')} data-liangxiang-market-popover="history" aria-label="我的结算回执" hidden={popover !== 'history'}>
            <div className={marketClass('popover-heading')}><strong>我的收盘回执</strong><button type="button" aria-label="关闭回执" onClick={() => setPopover(null)}>×</button></div>
            {view.receipts.length === 0 && <p>{view.historyLoading ? '正在读取…' : '第一份回执，收盘后见。'}</p>}
            {view.receipts.map(receipt => <Receipt key={receipt.id} receipt={receipt} />)}
            {view.nextCursor && <button type="button" onClick={() => { void session.loadHistory(true) }} disabled={view.historyLoading}>{view.historyLoading ? '读取中…' : '更早回执'}</button>}
          </section>
          <section id="liangxiang-market-rules" className={marketClass('popover')} data-liangxiang-market-popover="rules" aria-label="交易玩法" hidden={popover !== 'rules'}>
            <div className={marketClass('popover-heading')}><strong>30秒看懂梁股</strong><button type="button" aria-label="关闭玩法" onClick={() => setPopover(null)}>×</button></div>
            <ol className={marketClass('howto')}>
              <li><b>选一盘，选方向</b><p>做多盼涨，做空盼跌。整炷投入并冻结，封盘前可调整或撤回。</p></li>
              <li><b>记下这盘的梁位</b><div className={marketClass('rule-times')}>{market?.batches.map(batch => <span key={batch.batch}>P{batch.batch}<strong>{marketTime(batch.reference_at, market.timezone)}</strong></span>)}</div><p>定线＝记录此刻梁位。午夜收盘时，和这条线比高低。</p><div className={marketClass('rule-sides')}><span>↗ 做多：收盘更高就赢</span><span>↘ 做空：收盘更低就赢</span></div></li>
              <li><b>午夜一起揭晓</b><p>赢家按投入分走输方香火，并拿回本金。持平、单边或取消则退款。</p></li>
            </ol>
            <div className={marketClass('rule-example')}><b>举个例子</b><p>你投10炷，多池20、空池10。做多赢了，返还15炷＝本金10＋赚5。</p></div>
            <p className={marketClass('rule-note')}>出水占优，潜水落后，收盘才算数。点鱼看时间与香池。</p>
            <small className={marketClass('rule-trust')}>社区娱乐积分；用量由本机申报，钱包、时间与结果由服务器记账。</small>
          </section>
          <span className={marketClass('connection')} title={`${market?.business_date ?? ''} · ${market?.timezone ?? '服务器时区'}`}><i />{view.status === 'live' ? market?.status === 'open' ? '24:00后一起揭晓' : market?.status === 'cancelled' ? '已取消 · 已退款' : '已收盘' : '正在重连'}</span>
        </footer>
      </>}
    </div>
  </div>
}

function BatchCard({ batch, state, now, pending, onSet, onInteract, onDraft }: { batch: MarketBatch, state: MarketState, now: number, pending: boolean, onSet(side: MarketSide | null, amount: number): void, onInteract(): void, onDraft(): void }): ReactElement {
  const [side, setSide] = useState<MarketSide>(batch.position?.side ?? 'long')
  const [amount, setAmount] = useState(String(batch.position?.amount ?? 5))
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) { setSide(batch.position?.side ?? 'long'); setAmount(String(batch.position?.amount ?? 5)) } }, [batch.position?.side, batch.position?.amount, editing])
  const editable = batch.status === 'open' && now < batch.locks_at && state.market?.status === 'open'
  const maximum = Math.min(MARKET_AMOUNT_MAX, state.wallet.available_incense + (batch.position?.amount ?? 0))
  const bounded = (raw: string): number => maximum === 0 ? 0 : Math.min(maximum, Math.max(1, Math.trunc(Number(raw === '' ? 5 : raw) || 1)))
  const value = bounded(amount)
  const ready = editable && maximum > 0 && !pending
  return <article className={marketClass('batch')} data-status={batch.status} data-liangxiang-market-batch={batch.batch} onFocusCapture={onInteract} onPointerDown={onInteract}>
    <form noValidate onSubmit={event => { event.preventDefault(); setAmount(String(value)); if (ready) { setEditing(false); onSet(side, value) } }}>
      <div className={marketClass('order')}>
        <div className={marketClass('direction')} role="group" aria-label={`P${batch.batch} 仓位方向`}>
          <button type="button" data-fish-action="long" aria-pressed={side === 'long'} disabled={pending || !editable} onClick={() => { setSide('long'); setEditing(true) }}><span className={marketClass('button-face')}>↗ 做多</span></button>
          <button type="button" data-fish-action="short" aria-pressed={side === 'short'} disabled={pending || !editable} onClick={() => { setSide('short'); setEditing(true) }}><span className={marketClass('button-face')}>↘ 做空</span></button>
        </div>
        <label className={marketClass('amount')} title={`本盘总投入，最多${maximum.toLocaleString()}炷`}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 15h10M6 15l1 3h6l1-3M7 12V6m3 6V3m3 9V6M7 3V2m3-1V0m3 3V2" /></svg>
          <input type="number" inputMode="numeric" min={maximum > 0 ? 1 : 0} max={maximum} step="1" value={amount} disabled={pending || !editable} aria-label={`P${batch.batch} 总投入香火`} onBlur={() => { setAmount(String(value)); if (editing) onDraft() }} onChange={event => { const raw = event.target.value; setAmount(raw === '' ? '' : String(bounded(raw))); setEditing(true) }} /><span>炷</span>
        </label>
        <div className={marketClass('order-actions')}>
          <button className="liangxiang-market-action liangxiang-market-primary" type="submit" disabled={!ready}><span className={marketClass('button-face')}>{!editable ? batch.status === 'pending' ? '待开放' : '已封盘' : maximum === 0 ? '暂无香火' : pending ? '确认中…' : batch.position ? '确认调整' : '确认投入'}</span></button>
          <button className="liangxiang-market-action liangxiang-market-withdraw" type="button" disabled={pending || !editable || !batch.position} onClick={() => { setEditing(false); onSet(null, 0) }}><span className={marketClass('button-face')}>撤回</span></button>
        </div>
      </div>
    </form>
  </article>
}

function Receipt({ receipt }: { receipt: MarketReceipt }): ReactElement {
  return <details className={marketClass('receipt')}><summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: '12px' }}><span>{receipt.business_date} <small>投入 {receipt.invested_incense} · 返还 {receipt.returned_incense}</small></span><strong style={{ color: receipt.pnl_incense >= 0 ? 'var(--liangxiang-market-blue-text)' : 'var(--liangxiang-market-sub)' }}>{receipt.pnl_incense > 0 ? '+' : ''}{receipt.pnl_incense} 炷</strong></summary>
    <div style={{ fontSize: '10px', color: 'var(--liangxiang-market-sub)', lineHeight: 1.9 }}>{receipt.batches.map(batch => <div key={batch.batch}>P{batch.batch} · {sideLabel(batch.side)} {batch.amount} 炷 → 返还 {batch.payout} 炷{batch.result === 'void' || batch.result === 'draw' ? '（退回）' : ''}</div>)}</div>
  </details>
}
