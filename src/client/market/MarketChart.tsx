import { memo, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react'
import type { MarketCandle, MarketState, MarketBatch } from '../../shared/market-v1.ts'
import { PLUGIN_VERSION } from '../../shared/index.ts'
import { chartRange, marketRatioLabel, marketTime, pointRatio, positionMood } from './chart-model.ts'
import { marketBubbleLabel, marketTideGaps, marketTidePath, marketTideSegments, marketVolumeBubbles, type VolumeBubble } from './tide-model.ts'

export const MARKET_WHALE_PATH = `/liangxiang/api/market/art.webp?v=${encodeURIComponent(PLUGIN_VERSION)}`
const WIDTH = 960, HEIGHT = 330, LEFT = 20, RIGHT = 78, TOP = 56, BOTTOM = 35
const INK = 'var(--liangxiang-market-blue, #456bef)'
const LIGHT_INK = 'color-mix(in srgb, var(--dsw-alias-label-primary, #172139) 68%, #6682c3)'

const CandleLayer = memo(function CandleLayer({ candles, from, until, min, max }: { candles: MarketCandle[], from: number, until: number, min: number, max: number }): ReactElement {
  const x = (at: number): number => LEFT + (at - from) / Math.max(1, until - from) * (WIDTH - LEFT - RIGHT)
  const y = (ratio: number): number => TOP + (max - ratio) / (max - min) * (HEIGHT - TOP - BOTTOM)
  const width = Math.max(1.2, Math.min(10, 240_000 / Math.max(1, until - from) * (WIDTH - LEFT - RIGHT)))
  return <g>{candles.map(candle => {
    if (candle.open === null || candle.close === null || candle.high === null || candle.low === null) return null
    const cx = x(candle.at + 150_000), rising = candle.close >= candle.open
    return <g key={candle.at} data-liangxiang-market-candle="">
      <line x1={cx} x2={cx} y1={y(candle.high)} y2={y(candle.low)} stroke={INK} strokeWidth="1" />
      <rect x={cx - width / 2} y={Math.min(y(candle.open), y(candle.close))} width={width} height={Math.max(1.3, Math.abs(y(candle.close) - y(candle.open)))} fill={rising ? INK : 'var(--dsw-alias-bg-layer-2, #fff)'} stroke={INK} strokeWidth="1" rx=".6" />
    </g>
  })}</g>
})

const TideLayer = memo(function TideLayer({ candles, from, until, min, max, observedAt }: { candles: MarketCandle[], from: number, until: number, min: number, max: number, observedAt: number }): ReactElement {
  const segments = useMemo(() => marketTideSegments(candles, observedAt), [candles, observedAt])
  const x = (at: number): number => LEFT + (at - from) / Math.max(1, until - from) * (WIDTH - LEFT - RIGHT)
  const y = (ratio: number): number => TOP + (max - ratio) / (max - min) * (HEIGHT - TOP - BOTTOM)
  return <g>{segments.map((segment, index) => {
    const path = marketTidePath(segment, point => ({ x: x(point.at), y: y(point.ratio) }), HEIGHT - BOTTOM)
    const last = segment[segment.length - 1]!
    return <g key={segment[0]!.at}>
      {path.area && <path d={path.area} fill="url(#liangxiang-market-tide-fill)" data-liangxiang-market-tide-area="" />}
      <path d={path.line} fill="none" stroke={INK} strokeWidth="2.3" strokeLinejoin="round" strokeLinecap="round" data-liangxiang-market-tide-segment={index} />
      <circle cx={x(last.at)} cy={y(last.ratio)} r="2.5" fill={INK} />
    </g>
  })}</g>
})

export function MarketWhale({ batch, state, small = false }: { batch: MarketBatch, state: MarketState, small?: boolean }): ReactElement {
  const mood = positionMood(batch, state.market?.close_point ?? state.current_point)
  const label = { waiting: '待定线', ahead: '当前占优', behind: '暂时落后', even: '当前持平', won: '已获胜', lost: '本批未中', returned: '已退回' }[mood]
  return <span className="liangxiang-market-whale" data-mood={mood} data-small={small} role="img" aria-label={label}>
    <img src={MARKET_WHALE_PATH} alt="" draggable={false} decoding="async" />
    <span className="liangxiang-market-water" aria-hidden="true" />
    <i className="liangxiang-market-bubble" aria-hidden="true" /><i className="liangxiang-market-bubble" aria-hidden="true" />
  </span>
}

export const MarketChart = memo(function MarketChart({ state, candles, animated, recent = false }: { state: MarketState, candles: MarketCandle[], animated: boolean, recent?: boolean }): ReactElement {
  const [hover, setHover] = useState<number | null>(null)
  const [mode, setMode] = useState<'tide' | 'candles'>('tide')
  const [eventHover, setEventHover] = useState<VolumeBubble | null>(null)
  const [gapHover, setGapHover] = useState<number | null>(null)
  const market = state.market
  const points = useMemo(() => market ? [...market.batches.map(batch => batch.reference), market.close_point, state.current_point] : [state.current_point], [market, state.current_point])
  const range = useMemo(() => chartRange(candles, points, mode === 'tide' ? 'close' : 'ohlc'), [candles, points, mode])
  const start = market ? Math.min(market.opens_at, candles[0]?.at ?? market.opens_at) : candles[0]?.at ?? state.server_time - 86_400_000
  const end = market?.closes_at ?? state.server_time
  const recentEnd = Math.min(end, Math.max(state.server_time, start + 14_400_000))
  const from = recent ? Math.max(start, recentEnd - 14_400_000) : start
  const until = recent ? recentEnd : end
  const visible = useMemo(() => candles.filter(c => c.at + 300_000 > from && c.at < until), [candles, from, until])
  const gaps = useMemo(() => marketTideGaps(candles).filter(gap => gap.until > from && gap.from < until), [candles, from, until])
  const bubbles = useMemo(() => marketVolumeBubbles(candles).filter(b => b.last_sample_at + 300_000 > from && b.last_sample_at < until), [candles, from, until])
  const plotWidth = WIDTH - LEFT - RIGHT, plotHeight = HEIGHT - TOP - BOTTOM
  const x = (at: number): number => LEFT + (at - from) / Math.max(1, until - from) * plotWidth
  const y = (ratio: number): number => TOP + (range.max - ratio) / (range.max - range.min) * plotHeight
  const current = pointRatio(market?.close_point ?? state.current_point)
  const selected = hover === null ? undefined : visible[hover]
  const timezone = market?.timezone ?? 'UTC'
  const move = (event: PointerEvent<SVGSVGElement>): void => {
    if (visible.length === 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const at = from + ((event.clientX - bounds.left) / bounds.width * WIDTH - LEFT) / plotWidth * (until - from)
    setEventHover(null)
    if (gaps.some(gap => at >= gap.from && at < gap.until)) { setHover(null); setGapHover(at); return }
    setGapHover(null)
    let nearest = 0
    for (let i = 1; i < visible.length; i++) if (Math.abs(visible[i]!.at - at) < Math.abs(visible[nearest]!.at - at)) nearest = i
    setHover(nearest)
  }
  const key = (event: KeyboardEvent<SVGSVGElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    setEventHover(null); setGapHover(null)
    setHover(Math.max(0, Math.min(visible.length - 1, (hover ?? visible.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))))
  }
  const selectedCopy = eventHover ? marketBubbleLabel(eventHover, timezone) : gapHover !== null ? `${marketTime(gapHover, timezone)} · 此段无行情柱，走势未连接` : selected
    ? `${marketTime(Math.min(selected.at + 300_000, state.server_time), timezone)} ${mode === 'tide' ? `梁位 ${marketRatioLabel(selected.close)}` : `开 ${marketRatioLabel(selected.open)} 高 ${marketRatioLabel(selected.high)} 低 ${marketRatioLabel(selected.low)} 收 ${marketRatioLabel(selected.close)}`} · 本场新增 ${selected.volume.toLocaleString('zh-CN')} 炷` : ''
  return <figure className="liangxiang-market-chart" data-animated={animated} data-liangxiang-market-chart-mode={mode} style={{ margin: 0 }}>
    <div className="liangxiang-market-chart-toolbar">
      <div className="liangxiang-market-chart-readout" aria-hidden="true">{selectedCopy || `官方五分钟${mode === 'tide' ? '潮汐' : '烛线'} · 当前梁位 ${marketRatioLabel(current)}`}</div>
      <div role="group" aria-label="走势画法" style={{ display: 'flex', gap: '4px', flexShrink: 0 }}><button type="button" aria-pressed={mode === 'tide'} data-selected={mode === 'tide'} onClick={() => setMode('tide')}>潮汐</button><button type="button" aria-pressed={mode === 'candles'} data-selected={mode === 'candles'} onClick={() => setMode('candles')}>烛线</button></div>
    </div>
    <div className="liangxiang-market-chart-scroll">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" tabIndex={0}
        aria-label={`今日梁位${mode === 'tide' ? '潮汐' : '烛线'}，当前 ${marketRatioLabel(current)}。左右键查看官方五分钟数据；缺口不连线。${selectedCopy}`}
        onPointerMove={move} onPointerLeave={() => { setHover(null); setEventHover(null); setGapHover(null) }} onKeyDown={key}>
        <defs>
          <linearGradient id="liangxiang-market-sea" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#6c9efb" stopOpacity=".10" /><stop offset="1" stopColor="#77c5ee" stopOpacity=".015" /></linearGradient>
          <linearGradient id="liangxiang-market-tide-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#638ff5" stopOpacity=".28" /><stop offset="1" stopColor="#7fc8ef" stopOpacity=".025" /></linearGradient>
          <pattern id="liangxiang-market-gap-fill" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M0 9L9 0" stroke="currentColor" strokeOpacity=".09" strokeWidth="1" /></pattern>
        </defs>
        <rect x={LEFT} y={TOP} width={plotWidth} height={plotHeight} fill="url(#liangxiang-market-sea)" rx="12" />
        {gaps.map(gap => <rect key={gap.from} x={x(Math.max(from, gap.from))} y={TOP} width={x(Math.min(until, gap.until)) - x(Math.max(from, gap.from))} height={plotHeight} fill="url(#liangxiang-market-gap-fill)" data-liangxiang-market-gap="" />)}
        {[0, 1, 2, 3, 4].map(index => {
          const value = range.min + (range.max - range.min) * index / 4
          return <g key={index}><line x1={LEFT} x2={WIDTH - RIGHT} y1={y(value)} y2={y(value)} stroke="currentColor" opacity=".08" />
            <text x={WIDTH - RIGHT + 10} y={y(value) + 4} fill={LIGHT_INK} fontSize="11">{(value * 100).toFixed(2)}%</text></g>
        })}
        {[0, 1, 2, 3, 4].map(index => {
          const at = from + (until - from) * index / 4
          return <text key={index} x={x(at)} y={HEIGHT - 12} textAnchor={index === 0 ? 'start' : 'middle'} fill={LIGHT_INK} fontSize="11">{marketTime(at, timezone)}</text>
        })}
        {mode === 'tide' ? <TideLayer candles={visible} from={from} until={until} min={range.min} max={range.max} observedAt={Math.min(state.server_time, until)} /> : <CandleLayer candles={visible} from={from} until={until} min={range.min} max={range.max} />}
        {mode === 'tide' && bubbles.map((bubble, index) => {
          const cx = x(Math.min(bubble.last_sample_at + 300_000, state.server_time)), cy = Math.min(HEIGHT - BOTTOM - bubble.radius - 3, y(bubble.ratio) + bubble.radius + 9)
          const active = state.market?.status === 'open' && index >= bubbles.length - 3 && state.server_time - bubble.until < 1_800_000
          return <g key={bubble.at} className="liangxiang-market-volume-bubble" data-active={active} data-liangxiang-market-volume="" role="img" aria-label={marketBubbleLabel(bubble, timezone)}
            onPointerMove={event => { event.stopPropagation(); setHover(null); setGapHover(null); setEventHover(bubble) }} onPointerLeave={() => setEventHover(null)}>
            <circle cx={cx} cy={cy} r={bubble.radius} fill="#6ba8ea" fillOpacity=".22" stroke={INK} strokeOpacity=".55" strokeWidth="1.2" />
            <circle cx={cx - bubble.radius * .3} cy={cy - bubble.radius * .3} r={Math.max(1, bubble.radius * .17)} fill="#d8f0ff" opacity=".8" />
          </g>
        })}
        {visible.every(candle => candle.close === null) && <text x={WIDTH / 2} y={HEIGHT / 2} textAnchor="middle" fill={LIGHT_INK} fontSize="14">{current === null ? '待开梁 · 本场尚无已记录香火' : '等待第一段官方行情 · 不补画缺失的走势'}</text>}
        {market?.batches.map(batch => {
          const reference = pointRatio(batch.reference), at = batch.reference_at
          if (at < from || at > until) return null
          const cx = x(at)
          return <g key={batch.batch} data-liangxiang-market-reference={batch.batch}>
            <line x1={cx} x2={cx} y1={TOP - 8} y2={HEIGHT - BOTTOM} stroke={INK} strokeDasharray="3 6" opacity=".18" />
            <text x={cx} y={TOP - 16} textAnchor="middle" fill={INK} fontSize="12" fontWeight="650">P{batch.batch} {reference === null ? marketTime(at, timezone) : (reference * 100).toFixed(2) + '%'}</text>
            {reference !== null && <>
              <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(reference)} y2={y(reference)} stroke={INK} strokeDasharray={batch.batch === 1 ? '4 5' : batch.batch === 2 ? '9 5' : '2 6'} opacity=".36" />
              <circle cx={cx} cy={y(reference)} r="4" fill={INK} stroke="var(--dsw-alias-bg-layer-2, #fff)" strokeWidth="2" />
              {batch.position && <foreignObject x={Math.min(WIDTH - RIGHT - 52, Math.max(LEFT, cx - 25))} y={Math.max(4, y(reference) - 58)} width="52" height="62">
                <MarketWhale batch={batch} state={state} small />
              </foreignObject>}
            </>}
          </g>
        })}
        {current !== null && <g><line x1={LEFT} x2={WIDTH - RIGHT} y1={y(current)} y2={y(current)} stroke="#4a8fc4" strokeWidth="1.3" opacity=".65" />
          <rect x={WIDTH - RIGHT + 2} y={y(current) - 11} width="74" height="22" fill="#405ed5" rx="5" />
          <text x={WIDTH - RIGHT + 39} y={y(current) + 4} textAnchor="middle" fill="#fff" fontSize="11">{(current * 100).toFixed(3)}%</text></g>}
        {selected && <line x1={x(selected.at + 150_000)} x2={x(selected.at + 150_000)} y1={TOP} y2={HEIGHT - BOTTOM} stroke={INK} strokeDasharray="2 3" opacity=".5" />}
      </svg>
    </div>
    <figcaption>{mode === 'tide' ? '水位为五分钟收盘序列 · 气泡为本场半小时新增香火 · 缺口不连线' : '实心上涨 · 空心下跌'} · P1—P3 是各批参考线，最终以共同收盘梁位判定</figcaption>
  </figure>
})
