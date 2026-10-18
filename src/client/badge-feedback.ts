import { BADGE_SIZE, type BadgePoint, type Viewport } from './badge-position.ts'
import { SQUISH_EXIT_MS, SQUISH_MAX_ROWS } from './badge-squish.ts'

export interface FeedbackRect extends BadgePoint { width: number, height: number }
export interface FeedbackPlacement extends BadgePoint { align: 'start' | 'center' | 'end' }
export interface BadgeComment { id: number, text: string, createdAt: number }
export interface PresentedComment extends BadgeComment { slot: number, exitingAt?: number }
export const SPEECH_ROW_HEIGHT = 22
export const SPEECH_PADDING = 14
const GAP = 10
const MARGIN = 8

function overlaps(a: FeedbackRect, b: FeedbackRect): boolean {
  return a.x < b.x + b.width + GAP && a.x + a.width + GAP > b.x
    && a.y < b.y + b.height + GAP && a.y + a.height + GAP > b.y
}

/** Center the ordinary hint unless its actual width reaches a viewport edge. */
export function placeBadgeFeedback(badge: BadgePoint, viewport: Viewport, width: number, height: number, panel: FeedbackRect | null = null): FeedbackPlacement | null {
  const centered = badge.x + BADGE_SIZE / 2 - width / 2
  const x = Math.max(MARGIN, Math.min(viewport.width - MARGIN - width, centered))
  const candidates = [{ x, y: badge.y + BADGE_SIZE + GAP }, { x, y: badge.y - GAP - height }]
  if (panel) {
    const speech = placeBadgeSpeech(badge, viewport, width, panel, 1)
    if (speech) candidates.push({ x: speech.x, y: speech.y })
  }
  const point = candidates.find(point => point.x >= MARGIN && point.y >= MARGIN
    && point.x + width <= viewport.width - MARGIN && point.y + height <= viewport.height - MARGIN
    && !overlaps({ ...point, width, height }, { ...badge, width: BADGE_SIZE, height: BADGE_SIZE })
    && (!panel || !overlaps({ ...point, width, height }, panel)))
  return point ? { ...point, align: point.x > centered ? 'start' : point.x < centered ? 'end' : 'center' } : null
}

export interface SpeechPlacement extends BadgePoint { width: number, capacity: number, tail: 'left' | 'right', tailY: number, lift: number }

/** A voice beside the badge, within the panel's column. Never beside the panel. */
export function placeBadgeSpeech(badge: BadgePoint, viewport: Viewport, desiredWidth: number, panel: FeedbackRect | null, requestedRows = SQUISH_MAX_ROWS): SpeechPlacement | null {
  const left = panel?.x ?? MARGIN
  const right = panel ? panel.x + panel.width : viewport.width - MARGIN
  const roomLeft = badge.x - GAP - left
  const roomRight = right - badge.x - BADGE_SIZE - GAP
  const tail = roomRight >= roomLeft ? 'left' : 'right'
  const width = Math.min(desiredWidth, tail === 'left' ? roomRight : roomLeft)
  const panelAbove = panel === null || panel.y < badge.y
  const roomToLift = panel === null ? viewport.height : Math.max(0, panelAbove ? panel.y - MARGIN : viewport.height - MARGIN - panel.y - panel.height)
  const capacity = Math.min(SQUISH_MAX_ROWS, Math.floor((roomToLift + BADGE_SIZE - SPEECH_PADDING) / SPEECH_ROW_HEIGHT))
  if (width < 64 || capacity < 1) return null
  const height = Math.min(capacity, Math.max(1, requestedRows)) * SPEECH_ROW_HEIGHT + SPEECH_PADDING
  const x = tail === 'left' ? badge.x + BADGE_SIZE + GAP : badge.x - GAP - width
  const y = panelAbove ? badge.y + BADGE_SIZE - height : badge.y
  if (x < MARGIN || x + width > viewport.width - MARGIN || y < MARGIN || y + height > viewport.height - MARGIN) return null
  return { x, y, width, capacity, tail, tailY: badge.y + BADGE_SIZE / 2 - y, lift: Math.max(0, height - BADGE_SIZE) }
}

/** Removed rows remain present for the same exit, whether displaced or expired. */
export function reconcileBadgeComments(previous: PresentedComment[], comments: BadgeComment[], capacity: number, now: number): PresentedComment[] {
  const live: PresentedComment[] = comments.slice(0, capacity).map((comment, slot) => ({ ...comment, slot }))
  const retiring = previous.filter(row => !live.some(current => current.id === row.id)
    && (row.exitingAt === undefined || now - row.exitingAt < SQUISH_EXIT_MS))
    .map(row => row.exitingAt === undefined ? {
      ...row, exitingAt: now,
      slot: comments.length >= capacity ? Math.max(capacity, row.slot + 0.45) : row.slot + 0.45,
    } : row)
  return [...live, ...retiring].slice(0, SQUISH_MAX_ROWS + 2)
}
