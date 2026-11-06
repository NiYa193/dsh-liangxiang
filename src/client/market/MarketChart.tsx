import { memo, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react'
import type { MarketCandle, MarketState, MarketBatch, MarketBatchId } from '../../shared/market-v1.ts'
import { PLUGIN_VERSION } from '../../shared/index.ts'
import { chartRange, marketRatioLabel, marketTime, pointRatio, positionMood } from './chart-model.ts'
import { marketBubbleLabel, marketTideGaps, marketTidePath, marketTideSegments, marketVolumeBubbles, type VolumeBubble } from './tide-model.ts'
import { marketBubbleDirection, marketDepthBands, type MarketDepthBand } from './pond-model.ts'

export const MARKET_WHALE_PATH = `/liangxiang/api/market/art.webp?v=${encodeURIComponent(PLUGIN_VERSION)}`
const WIDTH = 760, HEIGHT = 360, LEFT = 14, RIGHT = 96, TOP = 30, BOTTOM = 42
const INK = 'var(--liangxiang-market-blue, #4d6bfe)'
const LIGHT_INK = 'var(--liangxiang-market-chart-text, #8a8271)'
const PAPER = 'var(--liangxiang-market-paper, var(--dsw-alias-bg-layer-2, #fffcf5))'
const TEXT = 'var(--liangxiang-market-ink, var(--dsw-alias-label-primary, #3a352c))'
const BORDER = 'var(--liangxiang-market-border, rgba(74, 72, 55, .18))'
const GOLD = 'var(--liangxiang-market-gold, #e2ae54)'
const VERMILION = 'var(--liangxiang-market-vermilion, #d2503f)'
const SLATE = 'var(--liangxiang-market-slate, #74839f)'

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
      {path.area && <><path d={path.area} fill="url(#liangxiang-market-tide-fill)" data-liangxiang-market-tide-area="" /><path d={path.area} fill="url(#liangxiang-market-tide-sheen)" /></>}
      <path d={path.line} fill="none" stroke={INK} strokeOpacity=".12" strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
      <path d={path.line} fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" data-liangxiang-market-tide-segment={index} />
      <circle cx={x(last.at)} cy={y(last.ratio)} r="2.5" fill={INK} />
    </g>
  })}</g>
})

/** The proposal's pond structure is decoration; all band names come from policy. */
function DepthZones({ bands, current }: { bands: MarketDepthBand[], current: number | null }): ReactElement {
  const y = (ratio: number): number => TOP + (1 - ratio) * (HEIGHT - TOP - BOTTOM)
  return <g data-liangxiang-market-depth="">{bands.map(band => {
    const active = current !== null && current >= band.low && (current < band.high || (band.high === 1 && current === 1))
    const cy = (y(band.low) + y(band.high)) / 2
    return <g key={band.state} data-liangxiang-market-zone={band.state}>
      <rect x={LEFT} y={y(band.high)} width={WIDTH - LEFT - RIGHT} height={y(band.low) - y(band.high)} fill={INK} opacity={active ? '.045' : '.012'} />
      {band.low > 0 && <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(band.low)} y2={y(band.low)} stroke={BORDER} strokeDasharray="2 6" strokeWidth="1.2" />}
      <g className="liangxiang-market-depth-label" data-active={active} transform={`translate(${WIDTH - RIGHT + 48} ${cy})`}>
        <rect x="-41" y="-10" width="82" height="20" rx="10" fill={active ? GOLD : 'none'} fillOpacity={active ? '.16' : '1'} stroke={active ? GOLD : BORDER} strokeWidth={active ? '1.5' : '1'} />
        <text x="0" y="0" textAnchor="middle" dominantBaseline="central" fontSize="11.5" fontWeight={active ? '700' : '500'} fill={active ? TEXT : LIGHT_INK}>{band.label}<tspan className="liangxiang-market-depth-range"> {band.range}</tspan></text>
      </g>
    </g>
  })}</g>
}

function PondFloor(): ReactElement {
  const waves = `M${LEFT - 6} ${HEIGHT - BOTTOM + 26}q24 -9 48 0${'t48 0'.repeat(Math.ceil((WIDTH - LEFT - RIGHT) / 48) - 1)}`
  return <g data-liangxiang-market-pond-floor="" aria-hidden="true">
    <path d={waves} fill="none" stroke={BORDER} strokeWidth="2" strokeLinecap="round" />
    {[[60, 1], [205, .7], [480, 1.2], [590, .6]].map(([offset, scale]) => <ellipse key={offset} cx={LEFT + offset!} cy={HEIGHT - BOTTOM + 30 + scale! * 3} rx={9 * scale! + 6} ry={5 * scale! + 3} fill={LIGHT_INK} opacity=".16" />)}
  </g>
}

export function MarketWhale({ batch, state, small = false }: { batch: MarketBatch, state: MarketState, small?: boolean }): ReactElement {
  const mood = positionMood(batch, state.market?.close_point ?? state.current_point)
  const label = { waiting: '待定线', ahead: '当前占优', behind: '暂时落后', even: '当前持平', won: '已获胜', lost: '本批未中', returned: '已退回' }[mood]
  return <span className="liangxiang-market-whale" data-mood={mood} data-small={small} role="img" aria-label={label}>
    <img className="liangxiang-market-whale-art" src={MARKET_WHALE_PATH} alt="" draggable={false} decoding="async" />
    <span className="liangxiang-market-water" aria-hidden="true" />
    <i className="liangxiang-market-bubble" aria-hidden="true" /><i className="liangxiang-market-bubble" aria-hidden="true" />
  </span>
}

export const MarketChart = memo(function MarketChart({ state, candles, animated, recent = false, selectedBatch, liangziPolicyId }: { state: MarketState, candles: MarketCandle[], animated: boolean, recent?: boolean, selectedBatch?: MarketBatchId, liangziPolicyId?: string }): ReactElement {
  const [hover, setHover] = useState<number | null>(null)
  const [mode, setMode] = useState<'tide' | 'candles'>('tide')
  const [eventHover, setEventHover] = useState<VolumeBubble | null>(null)
  const [gapHover, setGapHover] = useState<number | null>(null)
  const market = state.market
  const bands = useMemo(() => marketDepthBands(liangziPolicyId), [liangziPolicyId])
  const points = useMemo(() => market ? [...market.batches.map(batch => batch.reference), market.close_point, state.current_point] : [state.current_point], [market, state.current_point])
  // A pond keeps its natural 0–100% depth. Auto-zoom belongs to the optional
  // candle view; it made an ordinary 50% waterline look like a dry lakebed.
  const range = useMemo(() => mode === 'tide' ? { min: 0, max: 1 } : chartRange(candles, points, 'ohlc'), [candles, points, mode])
  const start = market ? Math.min(market.opens_at, candles[0]?.at ?? market.opens_at) : candles[0]?.at ?? state.server_time - 86_400_000
  // The pond follows the part of the day already observed. Future stages live
  // in the three tabs; empty future hours must not squeeze today's tide away.
  const end = Math.max(start + 3_600_000, Math.min(market?.closes_at ?? state.server_time, state.server_time))
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
  const chosenBatch = selectedBatch === undefined ? market?.batches.find(batch => batch.position) : market?.batches.find(batch => batch.batch === selectedBatch)
  const mood = chosenBatch?.position ? positionMood(chosenBatch, market?.close_point ?? state.current_point) : 'even'
  const submerged = mood === 'behind' || mood === 'lost'
  const currentAt = market?.close_point?.at ?? state.current_point?.at ?? state.server_time
  const currentX = x(currentAt)
  const currentInRange = currentAt >= from && currentAt <= until
  const currentY = current === null ? HEIGHT - BOTTOM - 18 : y(current)
  // Only the decorative character can be nudged away from an edge. The official
  // dot and every reference remain at their exact time and ratio coordinates.
  const fishX = current === null ? WIDTH * .62 : Math.max(LEFT + 44, Math.min(WIDTH - RIGHT - 58, currentX))
  // The toolbar provides 30px of headroom above the plot. Only the illustration
  // yields at a full pond; the official point and waterline never move.
  const fishBaseline = Math.max(63, currentY + 14 + (submerged ? 40 : 0))
  const fishLeft = fishX - 46.74, fishTop = fishBaseline - 91.02, fishWidth = 93.48, fishHeight = 112.34
  const activeBand = current === null ? undefined : bands.find(band => current >= band.low && (current < band.high || (band.high === 1 && current === 1)))
  const badgeWidth = 146, badgeHalf = badgeWidth / 2
  const badgeOnLeft = currentX - 146 >= LEFT + badgeHalf
  const badgeX = current === null ? LEFT + 150 : Math.max(LEFT + badgeHalf + 4, Math.min(WIDTH - RIGHT - badgeHalf - 4, currentX + (badgeOnLeft ? -146 : 146)))
  const badgeTop = current === null ? TOP + 40 : Math.max(34, currentY - 78)
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
  const selectedCopy = eventHover ? marketBubbleLabel(eventHover, timezone) : gapHover !== null ? `${marketTime(gapHover, timezone)} · 起雾啦（这段未记录，走势不连线）` : selected
    ? `${marketTime(Math.min(selected.at + 300_000, state.server_time), timezone)} ${mode === 'tide' ? `梁位 ${marketRatioLabel(selected.close)}` : `开 ${marketRatioLabel(selected.open)} 高 ${marketRatioLabel(selected.high)} 低 ${marketRatioLabel(selected.low)} 收 ${marketRatioLabel(selected.close)}`} · 本场新增 ${selected.volume.toLocaleString('zh-CN')} 炷` : ''
  return <figure className="liangxiang-market-chart" data-animated={animated} data-liangxiang-market-chart-mode={mode} style={{ margin: 0 }}>
    <div className="liangxiang-market-chart-toolbar">
      <div className="liangxiang-market-chart-readout" aria-hidden="true">{selectedCopy || <><span className="liangxiang-market-phone-current">梁位 {marketRatioLabel(current)}</span><span className="liangxiang-market-chart-hint">碰一碰水面，看看香火</span></>}</div>
      <div role="group" aria-label="走势画法" style={{ display: 'flex', gap: '4px', flexShrink: 0 }}><button type="button" aria-pressed={mode === 'tide'} data-selected={mode === 'tide'} onClick={() => setMode('tide')}>潮汐</button><button type="button" aria-pressed={mode === 'candles'} data-selected={mode === 'candles'} onClick={() => setMode('candles')}>烛线</button></div>
    </div>
    <div className="liangxiang-market-chart-scroll">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" tabIndex={0} style={{ width: '100%', minWidth: 0, height: 'auto', display: 'block', overflow: 'visible' }}
        aria-label={`今日梁位${mode === 'tide' ? '潮汐' : '烛线'}，当前 ${marketRatioLabel(current)}${activeBand ? `，${activeBand.label}` : ''}。左右键查看官方五分钟数据；缺口不连线。${selectedCopy}`}
        onPointerMove={move} onPointerLeave={() => { setHover(null); setEventHover(null); setGapHover(null) }} onKeyDown={key}>
        <defs>
          <linearGradient id="liangxiang-market-tide-fill" x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--liangxiang-market-water-top, #4d6bfe)" stopOpacity=".32" /><stop offset="1" stopColor="var(--liangxiang-market-water-bottom, #4d6bfe)" stopOpacity=".035" /></linearGradient>
          <linearGradient id="liangxiang-market-tide-sheen" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".16" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <linearGradient id="liangxiang-market-submerged" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#77beed" stopOpacity={submerged ? '.3' : '.13'} /><stop offset="1" stopColor="#4d6bfe" stopOpacity={submerged ? '.35' : '.2'} /></linearGradient>
          <pattern id="liangxiang-market-gap-fill" width="14" height="14" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="14" height="14" fill={LIGHT_INK} opacity=".08" /><path d="M0 0V14" stroke={LIGHT_INK} strokeOpacity=".3" strokeWidth="2.5" strokeDasharray="3 5" /></pattern>
          <mask id="liangxiang-market-whale-water-mask" maskUnits="userSpaceOnUse" x={fishLeft} y={fishTop} width={fishWidth} height={fishHeight} style={{ maskType: 'alpha' }}><image href={MARKET_WHALE_PATH} x={fishLeft} y={fishTop} width={fishWidth} height={fishHeight} /></mask>
        </defs>
        <rect x={LEFT} y={TOP} width={plotWidth} height={plotHeight} fill={INK} opacity=".045" rx="16" />
        {mode === 'tide' && <DepthZones bands={bands} current={current} />}
        <PondFloor />
        {gaps.map(gap => {
          const left = x(Math.max(from, gap.from)), right = x(Math.min(until, gap.until)), width = right - left
          return <g key={gap.from} role="img" aria-label="起雾啦：此段未记录，不代表无人上香，走势未连接">
            <rect x={left} y={TOP} width={width} height={plotHeight} fill="url(#liangxiang-market-gap-fill)" data-liangxiang-market-gap="" />
            <line x1={left} x2={left} y1={TOP} y2={TOP + plotHeight} stroke={LIGHT_INK} strokeDasharray="5 4" strokeWidth="1.6" opacity=".6" />
            <line x1={right} x2={right} y1={TOP} y2={TOP + plotHeight} stroke={LIGHT_INK} strokeDasharray="5 4" strokeWidth="1.6" opacity=".6" />
            {width >= 35 && <text x={(left + right) / 2} y={TOP + 22} textAnchor="middle" fontSize="11.5" fontWeight="600" fill={LIGHT_INK}>{width >= 130 ? '起雾啦 · 此段未记录' : '未记录'}</text>}
          </g>
        })}
        {mode === 'tide' ? <TideLayer candles={visible} from={from} until={until} min={range.min} max={range.max} observedAt={Math.min(state.server_time, until)} /> : <CandleLayer candles={visible} from={from} until={until} min={range.min} max={range.max} />}
        {mode === 'tide' && bubbles.map((bubble, index) => {
          const direction = marketBubbleDirection(bubble), radius = Math.min(17, bubble.radius * 1.22)
          const cx = x(Math.min(bubble.last_sample_at + 300_000, state.server_time))
          const rawY = y(bubble.ratio) + (direction === 'up' ? -radius - 8 : radius + 8)
          const cy = Math.max(radius + 3, Math.min(HEIGHT - 18 - radius, rawY))
          const fill = direction === 'up' ? VERMILION : direction === 'down' ? SLATE : 'var(--liangxiang-market-bubble-unknown, #b4b1a8)'
          const active = state.market?.status === 'open' && index >= bubbles.length - 3 && state.server_time - bubble.until < 1_800_000
          return <g key={bubble.at} className="liangxiang-market-volume-bubble" data-active={active} data-direction={direction ?? 'none'} data-liangxiang-market-volume="" role="img" aria-label={marketBubbleLabel(bubble, timezone)} style={{ cursor: 'pointer' }}
            onPointerMove={event => { event.stopPropagation(); setHover(null); setGapHover(null); setEventHover(bubble) }} onPointerLeave={() => setEventHover(null)}>
            <circle cx={cx} cy={cy} r={radius} fill={fill} opacity={direction === null ? '.48' : '1'} stroke={PAPER} strokeWidth="2" />
            {direction !== null && radius >= 9 && <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff">{direction === 'up' ? '夯' : '拉'}</text>}
          </g>
        })}
        {current !== null && visible.every(candle => candle.close === null) && <text x={LEFT + plotWidth / 2} y={TOP + 25} textAnchor="middle" fill={LIGHT_INK} fontSize="12">等第一笔香火落进水里 · 缺失的走势不补画</text>}
        {market?.batches.map(batch => {
          const reference = pointRatio(batch.reference), at = batch.reference_at
          if (at < from || at > until) return null
          const cx = x(at)
          return <g key={batch.batch} data-liangxiang-market-reference={batch.batch}>
            <line x1={cx} x2={cx} y1={TOP + 6} y2={HEIGHT - BOTTOM} stroke={INK} strokeDasharray="2 7" opacity={batch.batch === selectedBatch ? '.2' : '.09'} />
            <text x={cx} y={TOP + 17} textAnchor="middle" fill={LIGHT_INK} fontSize="11" fontWeight={batch.batch === selectedBatch ? '650' : '400'}>P{batch.batch} · {marketTime(at, timezone)}</text>
            {reference !== null && <>
              <circle cx={cx} cy={y(reference)} r={batch.batch === selectedBatch ? '4.5' : '3.2'} fill={INK} stroke={PAPER} strokeWidth="1.8" />
              {batch.position && <text x={cx + 9} y={y(reference) + 4} fill={LIGHT_INK} fontSize="10">{batch.position.side === 'long' ? '多' : '空'}</text>}
            </>}
          </g>
        })}
        <g data-liangxiang-market-main-whale="" data-mood={current === null ? 'waiting' : mood} aria-hidden="true">
          {current !== null && currentInRange && <path d={`M${badgeX + (badgeOnLeft ? badgeHalf : -badgeHalf)} ${badgeTop + 12}C${badgeX + (badgeOnLeft ? 95 : -95)} ${badgeTop + 4} ${currentX + (badgeOnLeft ? -35 : 35)} ${currentY - 26} ${currentX} ${currentY}`} fill="none" stroke={GOLD} strokeWidth="1.3" strokeDasharray="3 4" opacity=".8" />}
          <g className="liangxiang-market-current-whale" style={{ animation: animated && current !== null ? 'liangxiang-market-float 3.6s ease-in-out infinite' : 'none', transformBox: 'fill-box', transformOrigin: 'center' }} opacity={current === null ? '.66' : '1'}>
            <image data-liangxiang-market-whale-art="" href={MARKET_WHALE_PATH} x={fishLeft} y={fishTop} width={fishWidth} height={fishHeight} />
            <rect x={fishLeft} y={Math.max(currentY, fishTop)} width={fishWidth} height={Math.max(0, fishTop + fishHeight - Math.max(currentY, fishTop))} fill="url(#liangxiang-market-submerged)" mask="url(#liangxiang-market-whale-water-mask)" />
          </g>
          {current === null && <text x={fishX + 37} y={fishTop + 16} fill={LIGHT_INK} fontSize="16">z z</text>}
          <ellipse cx={fishX} cy={currentY + 4} rx="35" ry="4.4" fill={INK} fillOpacity=".08" stroke={INK} strokeOpacity=".28" strokeWidth="1.2" />
          {submerged && [0, 1, 2].map(index => <circle key={index} className="liangxiang-market-dive-bubble" cx={fishX + 34 + index * 7} cy={currentY - 8 - index * 12} r={4 - index * .8} fill="none" stroke="#67a8ed" strokeWidth="1.3" style={{ animation: animated ? `liangxiang-market-bubble 3s ${index * .6}s ease-in infinite` : 'none' }} />)}
          {current !== null && currentInRange && <circle data-liangxiang-market-current-point="" cx={currentX} cy={currentY} r="3.4" fill={GOLD} stroke={PAPER} strokeWidth="1.5" />}
          <g className="liangxiang-market-current-badge" data-liangxiang-market-current-badge="">
            <rect x={badgeX - badgeHalf} y={badgeTop} width={badgeWidth} height="28" rx="14" fill={PAPER} stroke={GOLD} strokeWidth="1.5" />
            <text x={badgeX} y={badgeTop + 19} textAnchor="middle" fontSize="12.5" fontWeight="700" fill={TEXT}>{current === null ? '待开梁' : `梁位 ${marketRatioLabel(current)}`}</text>
            <text className="liangxiang-market-badge-note" x={badgeX} y={badgeTop - 7} textAnchor="middle" fontSize="10.5" fill={LIGHT_INK}>{current === null ? '今日还没有香火，先去攒香吧' : activeBand?.label ?? '官方记录'}</text>
          </g>
        </g>
        {selected && <line x1={x(selected.at + 150_000)} x2={x(selected.at + 150_000)} y1={TOP} y2={HEIGHT - BOTTOM} stroke={INK} strokeDasharray="2 3" opacity=".5" />}
        {[0, 1, 2, 3, 4].map(index => {
          const at = from + (until - from) * index / 4, cx = x(at)
          return <g key={index} className="liangxiang-market-time-tick"><line x1={cx - 9} x2={cx + 9} y1={HEIGHT - BOTTOM + 10} y2={HEIGHT - BOTTOM + 10} stroke={LIGHT_INK} strokeWidth="1.6" strokeLinecap="round" opacity=".7" /><text x={cx} y={HEIGHT - 18} textAnchor={index === 0 ? 'start' : 'middle'} fill={LIGHT_INK} fontSize="11">{marketTime(at, timezone)}</text></g>
        })}
      </svg>
    </div>
    <figcaption className="liangxiang-market-pond-legend"><span><i style={{ background: VERMILION }} />夯</span><span><i style={{ background: SLATE }} />拉</span><span>气泡 = 半小时香火</span>{mode === 'tide' && bands.length > 0 && <span className="liangxiang-market-depth-caption">深度带 = 梁子称呼</span>}<span className="liangxiang-market-provenance">官方记录 · 缺口不连线</span></figcaption>
  </figure>
})
