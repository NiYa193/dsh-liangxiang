import { copyFile, mkdir, stat } from 'node:fs/promises'

const source = new URL('../src/client/assets/market-whale.webp', import.meta.url)
const target = new URL('../lib/market-whale.webp', import.meta.url)
const info = await stat(source)
if (info.size > 80_000) throw new Error('market artwork exceeds its 80 KB transfer budget')
await mkdir(new URL('../lib/', import.meta.url), { recursive: true })
await copyFile(source, target)
