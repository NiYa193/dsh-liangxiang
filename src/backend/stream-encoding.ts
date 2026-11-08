import type { DailyMarket, MarketState } from '../shared/market-v1.ts'

/** Compile only the captured PUBLIC view. Private values are encoded afresh
 * for each owner; no installation's state is ever used as a shared template. */
export function createMarketStreamEncoder(
  common: Omit<MarketState, 'wallet' | 'market'>,
  market: DailyMarket | null,
): (state: MarketState) => string {
  const commonFields = JSON.stringify(common).slice(1, -1)
  const batchFields = market?.batches.map(batch => ({
    id: batch.batch,
    fields: Object.entries(batch).filter(([key, value]) => key !== 'position' && value !== undefined)
      .map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(','),
  })) ?? []
  const marketFields = market === null ? [] : Object.entries(market)
    .filter(([key, value]) => key !== 'batches' && value !== undefined)
    .map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`)
  return state => {
    // This encoder is called only for states created by the owning frame.
    // A mismatched shape falls back to the ordinary complete serializer.
    if (state.market?.id !== market?.id || state.market?.batches.length !== market?.batches.length) return JSON.stringify(state)
    const batches = batchFields.map(batch => {
      const own = state.market?.batches.find(item => item.batch === batch.id)
      return own === undefined ? null : `{${batch.fields},"position":${JSON.stringify(own.position)}}`
    })
    if (batches.some(batch => batch === null)) return JSON.stringify(state)
    const encodedMarket = market === null ? 'null' : `{${marketFields.join(',')},"batches":[${batches.join(',')}]}`
    return `{${commonFields},"wallet":${JSON.stringify(state.wallet)},"market":${encodedMarket}}`
  }
}

export interface MarketStreamStateFactory {
  (installation: string, previous?: MarketState): MarketState
  serialize: (state: MarketState) => string
}
