import type { MarketBatch, MarketBatchId } from '../../shared/market-v1.ts'

const NAMES = ['早盘', '午盘', '晚盘'] as const
const STATUS: Record<MarketBatch['status'], string> = {
  pending: '待开放', open: '可投入', locked: '争梁位', live: '已定梁', settled: '已收盘', void: '已取消',
}

export function marketBatchName(batch: MarketBatchId): string { return NAMES[batch - 1]! }
export function marketBatchStatus(batch: MarketBatch): string { return STATUS[batch.status] }

/** Presentation only: truncate magnitude without rounding spendable money up. */
export function formatMarketIncense(value: number | bigint): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) return '--'
  if (!value) return '0'
  const sign = value < 0 ? '-' : '', magnitude = value < 0 ? -value : value, digits = magnitude.toString()
  if (digits.length < 5) return sign + magnitude.toLocaleString('en-US')
  const unit = Math.floor((digits.length - 1) / 4), whole = (digits.length - 1) % 4 + 1
  const leading = digits.slice(0, 4), fraction = leading.slice(whole).replace(/0+$/, '')
  return sign + leading.slice(0, whole) + (fraction ? `.${fraction}` : '')
    + (unit % 2 ? '万' : '') + '亿'.repeat(Math.floor(unit / 2))
}
