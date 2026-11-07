import { useEffect, useRef, useState, type ReactElement } from 'react'
import { MarketWhaleFigure } from './MarketWhaleFigure.tsx'
import { MARKET_WHALE_PATH } from './MarketChart.tsx'
import type { PositionMood } from './chart-model.ts'
import { createFishFeedback, expireFishFeedback, fishResponse, receiveFishFeedback, type FishReaction } from './fish-feedback.ts'
import { fishMotion, marketCss, marketClass } from './market-motion-style.ts'


export type { FishAction, FishReaction } from './fish-feedback.ts'

export const COMPANION_CSS = marketCss(`
.~companion{display:grid;grid-template-columns:96px minmax(0,1fr);align-items:center;gap:5px;width:300px;min-width:0;height:100px;flex:0 1 300px;pointer-events:none}
.~companion>svg{display:block;width:96px;height:100px;overflow:visible}
.~companion-speech{display:block;min-width:0;padding:4px 0;font-size:13px;line-height:1.4;color:var(--~blue-text);white-space:pre-line;overflow-wrap:anywhere;text-align:left}
.~companion-actor{transform-box:fill-box;transform-origin:50% 65%}
.~companion-sway{transform-box:fill-box;transform-origin:50% 65%}
.~companion[data-motion=true] .~companion-sway{animation:liangxiang-market-fish-swim 4.2s ease-in-out infinite}
.~companion[data-pose=dive][data-motion=true] .~companion-sway{animation-duration:3.2s}
@keyframes liangxiang-market-fish-swim{0%,100%{transform:translateX(-2px) rotate(-1deg)}50%{transform:translateX(3px) rotate(2deg)}}
.~companion[data-motion=false] *{animation:none!important;transition:none!important}
@media(prefers-reduced-motion:reduce){.~companion *{animation:none!important;transition:none!important}}
`)

/** The header fish never supplies financial state, announces live speech or sends data. */
export function MarketFishCompanion({ mood, animated, visible = true, reaction }: {
  mood: PositionMood, animated: boolean, visible?: boolean, reaction: FishReaction | null,
}): ReactElement {
  const [available, setAvailable] = useState(() => typeof document === 'undefined'
    || (!document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches))
  const [idleVariant, setIdleVariant] = useState(0)
  const [feedback, setFeedback] = useState(() => createFishFeedback(reaction))
  const active = feedback.active
  const lastPlayedId = useRef<number | null>(null)
  const actor = useRef<SVGGElement>(null)
  const accent = useRef<SVGGElement>(null)
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
    if (reaction) setFeedback(current => receiveFishFeedback(current, reaction, Date.now()))
  }, [reaction])
  useEffect(() => {
    if (!active) return
    const timer = setTimeout(() => setFeedback(current => expireFishFeedback(current, Date.now())), Math.max(0, feedback.until - Date.now()))
    return () => clearTimeout(timer)
  }, [active?.id, feedback.until])
  useEffect(() => {
    if (!running || active) return
    const timer = setTimeout(() => setIdleVariant(value => value + 1 + Math.floor(Math.random() * 3)), 32_000 + Math.floor(Math.random() * 14_000))
    return () => clearTimeout(timer)
  }, [running, active !== null, idleVariant])
  useEffect(() => {
    if (!active || active.id === lastPlayedId.current) return
    // Consume hidden/static actions too; resuming motion must not replay an old gesture.
    lastPlayedId.current = active.id
    if (!running || !actor.current?.animate) return
    const motion = fishMotion(active.action)
    if (!motion) return
    const animations = [actor.current.animate(motion.frames, { duration: motion.duration, easing: 'ease-in-out' })]
    // Accents share the consumed action's lifecycle; CSS must not replay them on resume.
    if (motion.accent === 'bubbles') accent.current?.querySelectorAll('circle').forEach((circle, index) => {
      animations.push(circle.animate([{ transform: 'translate(0,6px) scale(.5)', opacity: 0 }, { opacity: .8, offset: .25 }, { transform: 'translate(2px,-10px) scale(1.1)', opacity: 0 }], { duration: 950, delay: index * 110, easing: 'ease-out' }))
    })
    else if (motion.accent === 'stamp' && accent.current?.animate) animations.push(accent.current.animate([
      { transform: 'translateY(-4px) scale(.3)', opacity: 0 }, { transform: 'translateY(2px) scale(1.15)', opacity: 1, offset: .4 }, { transform: 'scale(.95)', opacity: .95, offset: .65 }, { transform: 'scale(1)', opacity: 0 },
    ], { duration: 1_200, easing: 'ease-out' }))
    return () => animations.forEach(animation => animation.cancel())
  }, [active?.id, running])
  const quote = active?.text ?? fishResponse(mood, active?.action ?? 'idle', active?.id ?? idleVariant)
  const activeAccent = active ? fishMotion(active.action)?.accent : 'none'
  return <div className={marketClass('companion')} aria-hidden="true" data-motion={running} data-pose={underwater ? 'dive' : 'surface'} data-reaction-id={active?.id ?? ''} data-fish-gesture={active?.action ?? 'idle'}>
    <svg viewBox="0 0 80 84" data-liangxiang-market-main-whale="">
      <g ref={actor} className={marketClass('companion-actor')}>
        <MarketWhaleFigure x={5} y={underwater ? 16 : 6} width={66} height={68} waterY={mood === 'waiting' ? 84 : 44} mood={mood} animated={running} src={MARKET_WHALE_PATH} />
      </g>
      <g ref={accent} key={active?.id ?? 'idle'} className={marketClass('companion-accent')} data-accent={activeAccent} fill="none" stroke="var(--liangxiang-market-blue-text)" strokeWidth="1.6">
        {activeAccent === 'bubbles' && <><circle cx="65" cy="47" r="2.4" /><circle cx="70" cy="39" r="3" /><circle cx="65" cy="31" r="1.8" /></>}
        {activeAccent === 'stamp' && <><circle cx="65" cy="17" r="8" fill="var(--liangxiang-market-paper)" /><path d="m61 17 3 3 5-6" strokeLinecap="round" strokeLinejoin="round" /></>}
      </g>
    </svg>
    <span className={marketClass('companion-speech')} title={quote} data-fish-action={active?.action ?? 'idle'}>{quote}</span>
  </div>
}
