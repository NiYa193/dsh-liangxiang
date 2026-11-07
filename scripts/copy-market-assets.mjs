import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import sharp from 'sharp'

const source = new URL('../src/client/assets/market-whale.webp', import.meta.url)
const target = new URL('../lib/market-whale.webp', import.meta.url)
const info = await stat(source)
if (info.size > 80_000) throw new Error('market artwork exceeds its 80 KB transfer budget')
const artwork = await sharp(await readFile(source)).metadata()
if (artwork.width !== 493 || artwork.height !== 512 || !artwork.hasAlpha) throw new Error('market artwork must retain the 493×512 transparent source-derived sprite')
await mkdir(new URL('../lib/', import.meta.url), { recursive: true })
await copyFile(source, target)
