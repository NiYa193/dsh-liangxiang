import { memo, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react'
import type { MarketCandle, MarketState, MarketBatch } from '../../shared/market-v1.ts'
import { chartRange, marketRatioLabel, marketTime, pointRatio, positionMood } from './chart-model.ts'

export const MARKET_WHALE_PATH = '/liangxiang/api/market/art.webp'
const WIDTH = 960, HEIGHT = 330, LEFT = 20, RIGHT = 78, TOP = 56, BOTTOM = 35
const INK = 'var(--liangxiang-market-blue, #456bef)'
const LIGHT_INK = 'color-mix(in srgb, var(--dsw-alias-label-primary, #172139) 68%, #6682c3)'

export function MarketWhale({ batch, state, small = false }: { batch: MarketBatch, state: MarketState, small?: boolean }): ReactElement {
  const mood = positionMood(batch, state.market?.close_point ?? state.current_point)
  const label = { waiting: '待定线', ahead: '当前占优', behind: '暂时落后', even: '当前持平', won: '已获胜', lost: '本批未中', returned: '已退回' }[mood]
  return <span className="liangxiang-market-whale" data-mood={mood} data-small={small} aria-label={label}>
    <img src={MARKET_WHALE_PATH} alt="" draggable={false} decoding="async" />
    <span className="liangxiang-market-water" aria-hidden="true" />
    <i className="liangxiang-market-bubble" aria-hidden="true" /><i className="liangxiang-market-bubble" aria-hidden="true" />
  </span>
}

export const MarketChart = memo(function MarketChart({ state, candles, animated, recent = false }: { state: MarketState, candles: MarketCandle[], animated: boolean, recent?: boolean }): ReactElement {
  const [hover, setHover] = useState<number | null>(null)
  const market = state.market
  const points = market ? [...market.batches.map(batch => batch.reference), market.close_point, state.current_point] : [state.current_point]
  const range = chartRange(candles, points)
  const start = market ? Math.min(market.opens_at, candles[0]?.at ?? market.opens_at) : candles[0]?.at ?? state.server_time - 86_400_000
  const end = market?.closes_at ?? state.server_time
  const recentEnd = Math.min(end, Math.max(state.server_time, start + 14_400_000))
  const from = recent ? Math.max(start, recentEnd - 14_400_000) : start
  const until = recent ? recentEnd : end
  const visible = candles.filter(c => c.at + 300_000 > from && c.at < until)
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
    let nearest = 0
    for (let i = 1; i < visible.length; i++) if (Math.abs(visible[i]!.at - at) < Math.abs(visible[nearest]!.at - at)) nearest = i
    setHover(nearest)
  }
  const key = (event: KeyboardEvent<SVGSVGElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    setHover(Math.max(0, Math.min(visible.length - 1, (hover ?? visible.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))))
  }
  const selectedCopy = selected ? `${marketTime(selected.at, timezone)} 开 ${marketRatioLabel(selected.open)} 高 ${marketRatioLabel(selected.high)} 低 ${marketRatioLabel(selected.low)} 收 ${marketRatioLabel(selected.close)}` : ''
  return <figure className="liangxiang-market-chart" data-animated={animated} style={{ margin: 0 }}>
    <div className="liangxiang-market-chart-readout" aria-hidden="true">
      {selected ? selectedCopy : `官方五分钟 K 线 · 当前梁位 ${marketRatioLabel(current)}`}
    </div>
    <div className="liangxiang-market-chart-scroll">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" tabIndex={0}
        aria-label={`今日梁位 K 线，当前 ${marketRatioLabel(current)}。左右键查看烛线。${selectedCopy}`}
        onPointerMove={move} onPointerLeave={() => setHover(null)} onKeyDown={key}>
        <defs>
          <linearGradient id="liangxiang-market-sea" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#6c9efb" stopOpacity=".10" /><stop offset="1" stopColor="#77c5ee" stopOpacity=".015" /></linearGradient>
        </defs>
        <rect x={LEFT} y={TOP} width={plotWidth} height={plotHeight} fill="url(#liangxiang-market-sea)" rx="12" />
        {[0, 1, 2, 3, 4].map(index => {
          const value = range.min + (range.max - range.min) * index / 4
          return <g key={index}><line x1={LEFT} x2={WIDTH - RIGHT} y1={y(value)} y2={y(value)} stroke="currentColor" opacity=".08" />
            <text x={WIDTH - RIGHT + 10} y={y(value) + 4} fill={LIGHT_INK} fontSize="11">{(value * 100).toFixed(2)}%</text></g>
        })}
        {[0, 1, 2, 3, 4].map(index => {
          const at = from + (until - from) * index / 4
          return <text key={index} x={x(at)} y={HEIGHT - 12} textAnchor={index === 0 ? 'start' : 'middle'} fill={LIGHT_INK} fontSize="11">{marketTime(at, timezone)}</text>
        })}
        {visible.map((candle, i) => {
          if (candle.open === null || candle.close === null || candle.high === null || candle.low === null) return null
          const cx = x(candle.at + 150_000), width = Math.max(1.2, Math.min(10, 240_000 / Math.max(1, until - from) * plotWidth))
          const rising = candle.close >= candle.open
          return <g key={candle.at} data-liangxiang-market-candle="" opacity={hover === null || hover === i ? 1 : .57}>
            <line x1={cx} x2={cx} y1={y(candle.high)} y2={y(candle.low)} stroke={INK} strokeWidth="1" />
            <rect x={cx - width / 2} y={Math.min(y(candle.open), y(candle.close))} width={width} height={Math.max(1.3, Math.abs(y(candle.close) - y(candle.open)))} fill={rising ? INK : 'var(--dsw-alias-bg-layer-2, #fff)'} stroke={INK} strokeWidth="1" rx=".6" />
          </g>
        })}
        {visible.length === 0 && <text x={WIDTH / 2} y={HEIGHT / 2} textAnchor="middle" fill={LIGHT_INK} fontSize="14">等待第一段官方行情 · 不补画缺失的走势</text>}
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
          <rect x={WIDTH - RIGHT + 2} y={y(current) - 11} width="74" height="22" fill={INK} rx="5" />
          <text x={WIDTH - RIGHT + 39} y={y(current) + 4} textAnchor="middle" fill="#fff" fontSize="11">{(current * 100).toFixed(3)}%</text></g>}
        {selected && <line x1={x(selected.at + 150_000)} x2={x(selected.at + 150_000)} y1={TOP} y2={HEIGHT - BOTTOM} stroke={INK} strokeDasharray="2 3" opacity=".5" />}
      </svg>
    </div>
    <figcaption>实心上涨 · 空心下跌 · P1—P3 是各批参考线，最终以共同收盘梁位判定</figcaption>
  </figure>
})
