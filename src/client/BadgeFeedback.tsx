import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { HOVER_TEXT } from '../shared/index.ts'
import { BADGE_SIZE, PANEL_GAP, type BadgePoint, type Viewport } from './badge-position.ts'
import { placeBadgeFeedback, placeBadgeSpeech, reconcileBadgeComments, SPEECH_PADDING, SPEECH_ROW_HEIGHT, type BadgeComment, type FeedbackRect, type PresentedComment } from './badge-feedback.ts'
import { SQUISH_EXIT_MS } from './badge-squish.ts'
import { color, font } from './theme.ts'

interface Props { position: BadgePoint, viewport: Viewport, open: boolean, comments: BadgeComment[], suppressed: boolean, reducedMotion: boolean, onLiftChange: (lift: number) => void }
const css = `
[data-liangxiang-feedback] { font: 500 12px/22px ${font.family}; }
[data-liangxiang-badge-tooltip] {
  position: fixed; width: max-content; padding: 4px 8px; border: 1px solid ${color.border}; border-radius: 8px;
  background: ${color.bgLayer}; color: ${color.textPrimary}; font-size: 11px; line-height: 18px;
  opacity: 0; transition: opacity 100ms ease;
}
[data-liangxiang-root]:has([data-liangxiang-badge]:hover, [data-liangxiang-badge]:focus-visible) [data-liangxiang-badge-tooltip][data-suppressed="false"] { opacity: 1; transition-delay: 180ms; }
[data-liangxiang-root]:has([data-squish-pressed="true"], [data-liangxiang-danmu]) [data-liangxiang-badge-tooltip] { opacity: 0 !important; transition-delay: 0ms; }
[data-liangxiang-root]:has([data-dragging="true"]) [data-liangxiang-feedback] { opacity: 0; }
[data-liangxiang-danmu] {
  --speech-bg: light-dark(color-mix(in srgb, ${color.bgLayer} 35%, #fffaf2), color-mix(in srgb, ${color.bgLayer} 92%, ${color.textPrimary}));
  --speech-edge: light-dark(color-mix(in srgb, ${color.ritualGold} 28%, ${color.border}), color-mix(in srgb, ${color.textPrimary} 22%, transparent));
  position: fixed; box-sizing: border-box; border: 1px solid var(--speech-edge); border-radius: 12px;
  background: var(--speech-bg); background-image: linear-gradient(125deg, color-mix(in srgb, ${color.ritualGold} 9%, transparent), transparent 72%);
  box-shadow: 0 5px 16px rgba(0,0,0,.16), inset 0 1px 0 color-mix(in srgb, ${color.textPrimary} 6%, transparent);
  padding: 6px 10px 6px 16px; color: ${color.textPrimary};
  opacity: 1; transition: opacity ${SQUISH_EXIT_MS}ms ease, width 180ms ease, top ${SQUISH_EXIT_MS}ms cubic-bezier(.2,.8,.2,1);
  animation: liangxiang-speech-enter 160ms ease-out;
}
[data-liangxiang-danmu]::before {
  content: ''; position: absolute; width: 7px; height: 7px; top: calc(var(--speech-tail-y) - 4px);
  background: var(--speech-bg); transform: rotate(45deg); border: 1px solid var(--speech-edge);
}
[data-liangxiang-danmu][data-tail="left"]::before { left: -5px; border-top: 0; border-right: 0; }
[data-liangxiang-danmu][data-tail="right"]::before { right: -5px; border-left: 0; border-bottom: 0; }
[data-liangxiang-danmu]::after { content: ''; position: absolute; left: 7px; top: 12px; width: 2px; height: 10px; border-radius: 2px; background: ${color.ritualGold}; }
[data-liangxiang-danmu][data-empty="true"] { opacity: 0; animation: none; }
[data-liangxiang-danmu-viewport] { position: relative; overflow: hidden; transition: height ${SQUISH_EXIT_MS}ms cubic-bezier(.2,.8,.2,1); }
[data-liangxiang-danmu-row] { position: absolute; top: 0; width: 100%; opacity: 1; transition: transform ${SQUISH_EXIT_MS}ms cubic-bezier(.2,.8,.2,1), opacity ${SQUISH_EXIT_MS}ms ease; }
[data-liangxiang-danmu-row][data-exiting="true"] { opacity: 0; }
[data-liangxiang-danmu-line] { display: block; width: max-content; white-space: nowrap; color: color-mix(in srgb, ${color.textPrimary} 86%, var(--speech-bg)); animation: liangxiang-speech-line 180ms ease-out; }
[data-liangxiang-danmu-row][data-slot="0"] [data-liangxiang-danmu-line] { color: ${color.textPrimary}; font-weight: 600; }
@keyframes liangxiang-speech-enter { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
@keyframes liangxiang-speech-line { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
[data-liangxiang-feedback][data-reduced-motion="true"] *, [data-liangxiang-feedback][data-reduced-motion="true"] *::before { animation: none !important; transition: none !important; }
`

export function BadgeFeedback({ position, viewport, open, comments, suppressed, reducedMotion, onLiftChange }: Props) {
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [panel, setPanel] = useState<FeedbackRect | null>(null)
  const [tooltipWidth, setTooltipWidth] = useState(66)
  const [laneWidth, setLaneWidth] = useState(144)
  const [presented, setPresented] = useState<PresentedComment[]>([])
  const lane = placeBadgeSpeech(position, viewport, laneWidth, panel, comments.length || presented.length)
  const capacity = lane?.capacity ?? 0
  const lift = open && presented.length > 0 ? lane?.lift ?? 0 : 0
  useLayoutEffect(() => { onLiftChange(lift) }, [lift, onLiftChange])
  useLayoutEffect(() => {
    setPresented(previous => open && capacity > 0 ? reconcileBadgeComments(previous, comments, capacity, Date.now()) : [])
  }, [comments, capacity, open])
  useEffect(() => {
    const deadlines = presented.flatMap(row => row.exitingAt === undefined ? [] : [row.exitingAt + SQUISH_EXIT_MS])
    if (!deadlines.length) return
    const timer = window.setTimeout(() => setPresented(current => current.filter(row => row.exitingAt === undefined || Date.now() - row.exitingAt < SQUISH_EXIT_MS)), Math.max(0, Math.min(...deadlines) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [presented])
  useLayoutEffect(() => {
    const root = tooltipRef.current?.closest('[data-liangxiang-root]')
    const element = open ? root?.querySelector<HTMLElement>('[data-liangxiang-panel]') : null
    const measure = (): void => {
      const rect = element?.getBoundingClientRect()
      setPanel(rect ? { x: rect.x, width: rect.width, height: rect.height,
        y: rect.y < position.y ? position.y - PANEL_GAP - rect.height : position.y + BADGE_SIZE + PANEL_GAP } : null)
      const label = tooltipRef.current?.getBoundingClientRect()
      if (label) setTooltipWidth(label.width)
      const widths = Array.from(root?.querySelectorAll<HTMLElement>('[data-liangxiang-danmu-line]') ?? [], line => line.getBoundingClientRect().width)
      if (widths.length) setLaneWidth(Math.max(144, ...widths.map(width => width + 28)))
    }
    measure()
    element?.addEventListener('animationend', measure)
    const observer = new ResizeObserver(measure)
    if (element) observer.observe(element)
    if (tooltipRef.current) observer.observe(tooltipRef.current)
    return () => { observer.disconnect(); element?.removeEventListener('animationend', measure) }
  }, [open, position.x, position.y, viewport.width, viewport.height, presented])
  const tooltip = placeBadgeFeedback(position, viewport, tooltipWidth, 28, panel)
  const liveCount = Math.min(capacity, comments.length)
  const rows = liveCount || Math.max(1, Math.min(capacity, presented.length))
  const tailY = Math.max(11, Math.min(rows * SPEECH_ROW_HEIGHT + SPEECH_PADDING - 11, lane?.tailY ?? 18))
  return (
    <div aria-hidden="true" data-liangxiang-feedback="" data-reduced-motion={reducedMotion} style={{ pointerEvents: 'none' }}>
      <style>{css}</style>
      <div ref={tooltipRef} data-liangxiang-badge-tooltip="" data-suppressed={suppressed || tooltip === null}
        data-align={tooltip?.align} style={{ left: tooltip?.x ?? 8, top: tooltip?.y ?? 8 }}>{HOVER_TEXT}</div>
      {open && lane && presented.length > 0 && (
        <div data-liangxiang-danmu="" data-tail={lane.tail} data-empty={liveCount === 0}
          style={{ left: lane.x, top: lane.y, width: lane.width, '--speech-tail-y': `${tailY}px` } as CSSProperties}>
          <div data-liangxiang-danmu-viewport="" style={{ height: rows * SPEECH_ROW_HEIGHT }}>
            {presented.map(comment => (
              <div key={comment.id} data-liangxiang-danmu-row={comment.id} data-slot={comment.slot} data-exiting={comment.exitingAt !== undefined}
                style={{ transform: `translateY(${comment.slot * SPEECH_ROW_HEIGHT}px)` }}>
                <span data-liangxiang-danmu-line="">{comment.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
