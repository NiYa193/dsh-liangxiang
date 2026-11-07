import { useEffect, useRef, useState, type ReactElement } from 'react'
import { MarketWhaleFigure } from './MarketWhaleFigure.tsx'
import { MARKET_WHALE_PATH } from './MarketChart.tsx'
import type { PositionMood } from './chart-model.ts'
import { fishResponse, type FishAction } from './fish-feedback.ts'

export type { FishAction } from './fish-feedback.ts'
export interface FishReaction { id: number, action: FishAction }

export const COMPANION_CSS = `
.liangxiang-market-companion{display:grid;grid-template-columns:72px minmax(0,1fr);align-items:center;gap:5px;width:174px;min-width:140px;height:64px;flex:0 1 174px;pointer-events:none}
.liangxiang-market-companion>svg{display:block;width:72px;height:60px;overflow:visible}
.liangxiang-market-companion-speech{font-size:11px;line-height:1.45;color:var(--liangxiang-market-blue-text);display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;max-height:32px;overflow-wrap:anywhere}
.liangxiang-market-companion-actor{transform-box:fill-box;transform-origin:50% 65%}
.liangxiang-market-companion-sway{transform-box:fill-box;transform-origin:50% 65%}
.liangxiang-market-companion[data-motion=true] .liangxiang-market-companion-sway{animation:liangxiang-market-fish-swim 4.2s ease-in-out infinite}
.liangxiang-market-companion[data-pose=dive][data-motion=true] .liangxiang-market-companion-sway{animation-duration:3.2s}
@keyframes liangxiang-market-fish-swim{0%,100%{transform:translateX(-2px) rotate(-1deg)}50%{transform:translateX(3px) rotate(2deg)}}
.liangxiang-market-companion[data-motion=false] *{animation:none!important;transition:none!important}
@media(prefers-reduced-motion:reduce){.liangxiang-market-companion *{animation:none!important;transition:none!important}}
`

/** The header fish never supplies financial state, announces live speech or sends data. */
export function MarketFishCompanion({ mood, animated, visible = true, reaction }: {
  mood: PositionMood, animated: boolean, visible?: boolean, reaction: FishReaction | null,
}): ReactElement {
  const [available, setAvailable] = useState(() => typeof document === 'undefined'
    || (!document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches))
  const [idleVariant, setIdleVariant] = useState(0)
  const [active, setActive] = useState<FishReaction | null>(() => reaction)
  const lastId = useRef<number | null>(reaction?.id ?? null)
  const lastPlayedId = useRef<number | null>(null)
  const actor = useRef<SVGGElement>(null)
  const running = animated && visible && available
  const underwater = mood === 'behind' || mood === 'lost'
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const change = (): void => setAvailable(!document.hidden && !media.matches)
    document.addEventListener('visibilitychange', change)
    media.addEventListener('change', change)
    change()
    return () => { document.removeEventListener('visibilitychange', change); media.removeEventListener('change', change) }
  }, [])
  useEffect(() => {
    if (reaction && reaction.id !== lastId.current) {
      lastId.current = reaction.id
      setActive(reaction)
    }
  }, [reaction])
  useEffect(() => {
    if (!active) return
    const id = active.id
    const timer = setTimeout(() => setActive(current => current?.id === id ? null : current), 4_000)
    return () => clearTimeout(timer)
  }, [active?.id])
  useEffect(() => {
    if (!running || active) return
    const timer = setInterval(() => setIdleVariant(value => value + 1), 18_000)
    return () => clearInterval(timer)
  }, [running, active !== null])
  useEffect(() => {
    if (!active || active.id === lastPlayedId.current) return
    // Consume hidden/static actions too; resuming motion must not replay an old gesture.
    lastPlayedId.current = active.id
    if (!running || !actor.current?.animate) return
    const side = active.action === 'short' ? 1 : active.action === 'long' ? -1 : active.id % 2 === 0 ? 1 : -1
    const frames = active.action === 'error'
      ? [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }]
      : [{ transform: 'translate(0,0) rotate(0deg) scale(1)' }, { transform: `translate(${4 * side}px,-3px) rotate(${8 * side}deg) scale(1.06,.96)` }, { transform: `translate(${-2 * side}px,1px) rotate(${-5 * side}deg) scale(.98,1.03)` }, { transform: 'translate(0,0) rotate(0deg) scale(1)' }]
    const animation = actor.current.animate(frames, { duration: 650, easing: 'ease-in-out' })
    return () => animation.cancel()
  }, [active?.id, running])
  const quote = fishResponse(mood, active?.action ?? 'idle', active?.id ?? idleVariant)
  return <div className="liangxiang-market-companion" aria-hidden="true" data-motion={running} data-pose={underwater ? 'dive' : 'surface'} data-reaction-id={active?.id ?? ''}>
    <svg viewBox="0 0 80 72" data-liangxiang-market-main-whale="">
      <g ref={actor} className="liangxiang-market-companion-actor"><g className="liangxiang-market-companion-sway">
        <MarketWhaleFigure x={5} y={underwater ? 12 : -1} width={66} height={68} waterY={mood === 'waiting' ? 72 : 40} mood={mood} animated={running} src={MARKET_WHALE_PATH} />
      </g></g>
    </svg>
    <span className="liangxiang-market-companion-speech" title={quote} data-fish-action={active?.action ?? 'idle'}>{quote}</span>
  </div>
}
