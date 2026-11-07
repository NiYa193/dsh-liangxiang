import type { PositionMood } from './chart-model.ts'

export type FishAction = 'idle' | 'draft' | 'submit' | 'confirmed' | 'withdraw' | 'long' | 'short'
  | 'batch1' | 'batch2' | 'batch3' | 'chart' | 'range' | 'history' | 'rules' | 'motion' | 'interval' | 'error'

const IDLE = {
  surface: ['探个头，继续看浪～', '尾巴晒太阳，眼睛盯水面。', '浪还在变，我可没走神。', '这片水面，有点意思～'],
  dive: ['咕噜…潜水也要看盘。', '先在水下练个憋气。', '没游远，只是在吐泡泡。', '水下安静，尾巴挺忙。'],
  waiting: ['先看浪，不着急～', '你挑时机，我盯水面。', '还没落笔，尾巴先动。', '鱼已就位，慢慢看～'],
} as const

const ACTIONS: Record<Exclude<FishAction, 'idle'>, readonly string[]> = {
  draft: ['先写着，还没落进账本。', '草稿记下，点头才算～'],
  submit: ['等账本点头～', '把这笔递过去，等回执。'],
  confirmed: ['账本点头了，继续看浪。', '这笔核对好了～'],
  withdraw: ['撤回也要等回执～', '先核对，再腾出香火。'],
  long: ['向上看浪，尾巴跟上～', '抬头啦，水面瞧一瞧。'],
  short: ['潜水眼镜，准备好了～', '换个方向，继续看浪。'],
  batch1: ['早盘，探个头～', '第一池浪，我来盯着。'],
  batch2: ['午盘，换个姿势看浪。', '中场看浪，尾巴不歇。'],
  batch3: ['晚盘，打起精神～', '最后一池，也慢慢看。'],
  chart: ['放大看细浪，缩小看全池。', '镜头跟上，鱼也跟上。'],
  range: ['换个时段，浪有新模样。', '镜头拉开，整池看一眼。'],
  history: ['翻翻旧回执，鱼也回个头。', '过去的浪，记在这里。'],
  rules: ['玩法先看懂，尾巴再开动。', '我陪你看，慢慢读～'],
  motion: ['尾巴开工，泡泡就位～', '动一动，才像大肥鱼。'],
  interval: ['镜头调细，瞧瞧小浪。', '换个粒度，慢慢看清。'],
  error: ['原单先核对，别急着重来。', '先缓一缓，我还在这儿。'],
}

/** Decorative conversation only. A confirmed line requires a confirmed receipt. */
export function fishResponse(mood: PositionMood, action: FishAction, variant = 0): string {
  const underwater = mood === 'behind' || mood === 'lost'
  const lines = action === 'idle' ? IDLE[underwater ? 'dive' : mood === 'waiting' || mood === 'even' || mood === 'returned' ? 'waiting' : 'surface'] : ACTIONS[action]
  const index = Math.abs(Math.trunc(Number.isFinite(variant) ? variant : 0)) % lines.length
  const line = lines[index]!
  return underwater && action !== 'idle' ? `咕噜，${line}` : line
}
