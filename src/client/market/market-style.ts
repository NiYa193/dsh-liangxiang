import { font } from '../theme.ts'
import { MARKET_MOTION_CSS } from './market-motion-style.ts'

export const MARKET_DIALOG_CSS = `
[data-liangxiang-market-backdrop]{background-image:radial-gradient(#9cb4dc1a .8px,transparent 1px);background-size:14px 14px}
[data-liangxiang-market-dialog]{
  --liangxiang-market-paper:light-dark(#fffcf5,#23211c);
  --liangxiang-market-paper-2:light-dark(#f7f2e6,#2a2820);
  --liangxiang-market-ink:light-dark(#3a352c,#ece7db);
  --liangxiang-market-sub:light-dark(#6b6356,#b8b09e);
  --liangxiang-market-border:light-dark(#3a352c29,#ece7db29);
  --liangxiang-market-gold:#e2ae54;
  --liangxiang-market-vermilion:#c44836;
  --liangxiang-market-slate:#61718b;
  --liangxiang-market-blue:#4d6bfe;
  --liangxiang-market-blue-text:light-dark(#3651b9,#a1b7ff);
  --liangxiang-market-pond-bg:light-dark(#4d6bfe0d,#4d6bfe0f);
  --liangxiang-market-water-top:#4d6bfe;
  --liangxiang-market-water-bottom:#729dff;
  --liangxiang-market-chart-text:var(--liangxiang-market-sub);
  box-sizing:border-box;color:var(--liangxiang-market-ink);font:13px ${font.family};color-scheme:light dark;
  width:min(820px,100%);max-height:calc(100dvh - 24px);overflow:auto;scrollbar-width:thin;
  background:var(--liangxiang-market-paper);border:1.5px solid var(--liangxiang-market-border);border-radius:18px;padding:18px 20px 12px;
  box-shadow:inset 0 1px 0 #ffffff24,0 4px 0 #24345235,0 18px 44px #081d463d;outline:none
}
[data-liangxiang-market-dialog] *{box-sizing:border-box}
[data-liangxiang-market-dialog] button,[data-liangxiang-market-dialog] input{font:inherit}
[data-liangxiang-market-dialog] button{cursor:pointer;border:0;background:transparent;color:var(--liangxiang-market-ink);border-radius:9px;padding:7px 11px;min-height:32px}
[data-liangxiang-market-dialog] button:hover:not(:disabled){background:color-mix(in srgb,#4d6bfe 9%,var(--liangxiang-market-paper))}
[data-liangxiang-market-dialog] button:disabled{opacity:.45;cursor:default}
[data-liangxiang-market-dialog] button:focus-visible,[data-liangxiang-market-dialog] input:focus-visible,[data-liangxiang-market-dialog] summary:focus-visible,[data-liangxiang-market-dialog] svg:focus-visible{outline:2px solid #4d6bfe;outline-offset:3px}
.liangxiang-market-header{display:flex;align-items:center;gap:14px;margin-bottom:12px}
.liangxiang-market-header-copy{flex:1;min-width:0}
.liangxiang-market-header h2{margin:0;font-size:18px;font-weight:700;letter-spacing:.2px}
.liangxiang-market-header-copy p{margin:4px 0 0;font-size:11px;color:var(--liangxiang-market-sub)}
.liangxiang-market-wallet{display:flex;align-items:baseline;gap:14px;white-space:nowrap;color:var(--liangxiang-market-sub);font-size:11px}
.liangxiang-market-wallet strong{color:var(--liangxiang-market-ink);font-variant-numeric:tabular-nums;font-size:15px;margin:0 3px;font-weight:650}
.liangxiang-market-wallet [data-liangxiang-market-available]{color:var(--liangxiang-market-blue-text);font-size:22px}
[data-liangxiang-market-dialog] .liangxiang-market-motion{font-size:11px;color:var(--liangxiang-market-sub);padding:4px 7px;white-space:nowrap}
[data-liangxiang-market-dialog] .liangxiang-market-close{font-size:22px;color:var(--liangxiang-market-sub);padding:0;min-width:28px;min-height:28px;border:1.5px solid var(--liangxiang-market-border);border-radius:50%;background:var(--liangxiang-market-paper-2);box-shadow:0 1px 0 var(--liangxiang-market-border)}
.liangxiang-market-chart{border:0;border-radius:15px;background:transparent;overflow:hidden}
.liangxiang-market-chart-toolbar{display:flex;align-items:center;gap:6px;padding:9px 12px 0}
.liangxiang-market-chart-readout{flex:1;min-width:0;min-height:20px;font-size:11px;color:var(--liangxiang-market-sub);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-liangxiang-market-dialog] .liangxiang-market-chart-toolbar button{padding:2px 7px;min-height:23px;font-size:11px;color:var(--liangxiang-market-sub)}
[data-liangxiang-market-dialog] button[data-selected=true]{background:color-mix(in srgb,#4d6bfe 12%,var(--liangxiang-market-paper));color:var(--liangxiang-market-ink);font-weight:650}
.liangxiang-market-chart-scroll{overflow:visible}
.liangxiang-market-chart-scroll>svg{display:block;width:100%;height:auto;min-width:0;touch-action:pan-y}
.liangxiang-market-chart figcaption{padding:0 12px 9px;font-size:11px;color:var(--liangxiang-market-sub);line-height:1.5}
.liangxiang-market-pond-legend{display:flex;align-items:center;flex-wrap:wrap;gap:5px 14px}
.liangxiang-market-pond-legend span{display:inline-flex;align-items:center;gap:5px}
.liangxiang-market-pond-legend i{display:inline-block;width:9px;height:9px;flex:none;border-radius:50%}
.liangxiang-market-provenance{margin-left:auto;font-variant-numeric:tabular-nums}
.liangxiang-market-depth-label{opacity:1}
.liangxiang-market-phone-current{display:none}
.liangxiang-market-stage-tabs{display:flex;gap:10px;margin:8px 0 0}
[data-liangxiang-market-dialog] .liangxiang-market-stage-tabs button{position:relative;flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:9px 5px;border:1.2px solid var(--liangxiang-market-border);border-radius:11px;background:var(--liangxiang-market-paper-2);box-shadow:0 2px 0 var(--liangxiang-market-border);color:var(--liangxiang-market-sub)}
.liangxiang-market-stage-tabs strong{font-size:12px;font-weight:600}
.liangxiang-market-stage-tabs small{font-size:11px}
[data-liangxiang-market-dialog] .liangxiang-market-stage-tabs [aria-selected=true]{color:var(--liangxiang-market-ink);background:color-mix(in srgb,#4d6bfe 6%,var(--liangxiang-market-paper));border-color:#4d6bfe;box-shadow:0 2px 0 #4d6bfe40}

.liangxiang-market-batch{padding:12px 0 9px;min-width:0}
.liangxiang-market-batch-meta{display:flex;justify-content:space-between;gap:10px;color:var(--liangxiang-market-sub);font-size:11px;line-height:1.6;margin-bottom:10px}
.liangxiang-market-batch-meta p{margin:0}
.liangxiang-market-pool-info{position:relative;flex-shrink:0}
.liangxiang-market-pool-info summary{cursor:pointer;list-style:none;white-space:nowrap}
.liangxiang-market-pool-info[open] .liangxiang-market-pool-detail{position:absolute;right:0;top:22px;z-index:5;min-width:150px;padding:10px 13px;border-radius:10px;border:1px solid var(--liangxiang-market-border);background:var(--liangxiang-market-paper);box-shadow:0 5px 20px #0002;line-height:1.9}
.liangxiang-market-position{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px;margin:0 0 10px}
.liangxiang-market-position [data-mood]{color:var(--liangxiang-market-blue-text);font-weight:600}
.liangxiang-market-position small{color:var(--liangxiang-market-sub);font-size:11px;margin-left:auto}
.liangxiang-market-order{display:flex;align-items:center;gap:10px}
.liangxiang-market-direction{display:flex;gap:4px;padding:3px;border-radius:10px;background:var(--liangxiang-market-paper-2);border:1px solid var(--liangxiang-market-border)}
[data-liangxiang-market-dialog] .liangxiang-market-direction button{white-space:nowrap;padding:0;min-height:32px;color:var(--liangxiang-market-sub);background:var(--liangxiang-market-border)}
[data-liangxiang-market-dialog] .liangxiang-market-direction button[aria-pressed=true]{background:#263e9a;color:#fff}
.liangxiang-market-amount{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex:1;min-width:100px;color:var(--liangxiang-market-sub);font-size:11px}
.liangxiang-market-amount input{width:100%;max-width:120px;min-width:50px;height:38px;border:1px solid var(--liangxiang-market-border);border-radius:9px;padding:6px 9px;background:var(--liangxiang-market-paper);color:var(--liangxiang-market-ink);font-variant-numeric:tabular-nums}
[data-liangxiang-market-dialog] .liangxiang-market-primary{background:#243e9a;color:#fff;padding:0;min-height:38px;white-space:nowrap;font-weight:600;border:0;box-shadow:0 3px 7px #16286124}
[data-liangxiang-market-dialog] .liangxiang-market-primary:hover:not(:disabled){background:#243e9a;color:#fff}

.liangxiang-market-button-face{position:relative;display:flex;align-items:center;justify-content:center;min-height:32px;padding:6px 14px;border:1px solid var(--liangxiang-market-border);border-radius:8px;background:linear-gradient(180deg,var(--liangxiang-market-paper),var(--liangxiang-market-paper-2));box-shadow:inset 0 1px 0 #ffffff55;transform:translateY(-2px)}
.liangxiang-market-button-face::after{content:'';position:absolute;top:2px;left:5px;right:5px;height:36%;border-radius:6px;background:linear-gradient(#ffffff24,transparent);pointer-events:none}
[data-liangxiang-market-dialog] .liangxiang-market-primary .liangxiang-market-button-face,[data-liangxiang-market-dialog] .liangxiang-market-direction [aria-pressed=true] .liangxiang-market-button-face{background:linear-gradient(180deg,#4664db,#3c58cb 58%,#304ebd);border-color:#2949bf;box-shadow:inset 0 1px 0 #ffffff66,inset 0 -1px 0 #182b7c44;color:#fff}
[data-liangxiang-market-dialog] .liangxiang-market-primary .liangxiang-market-button-face{min-height:38px;padding:9px 16px;transform:translateY(-4px)}
[data-liangxiang-market-dialog] button:active:not(:disabled)>.liangxiang-market-button-face{transform:translateY(0) scaleX(.985);box-shadow:inset 0 2px 4px #15234a30}
[data-liangxiang-market-dialog][data-animated=true] .liangxiang-market-button-face{transition:transform 260ms cubic-bezier(.18,.9,.3,1.5),box-shadow 160ms ease}
[data-liangxiang-market-dialog][data-animated=true] button:active>.liangxiang-market-button-face{transition-duration:65ms}
[data-liangxiang-market-dialog][data-animated=true] .liangxiang-market-stage-tabs button{transition:transform 220ms cubic-bezier(.18,.9,.3,1.5),box-shadow 140ms ease}
[data-liangxiang-market-dialog][data-animated=true] .liangxiang-market-stage-tabs button:hover{transform:translateY(-1px)}
[data-liangxiang-market-dialog] .liangxiang-market-stage-tabs button:active{transform:translateY(2px);box-shadow:0 0 0 var(--liangxiang-market-border)}
[data-liangxiang-market-dialog] .liangxiang-market-withdraw{font-size:11px;color:var(--liangxiang-market-sub);padding:5px 4px;white-space:nowrap}
.liangxiang-market-order-hint{margin:7px 0 0;color:var(--liangxiang-market-sub);font-size:11px;line-height:1.6}
.liangxiang-market-idle{margin:7px 0;color:var(--liangxiang-market-sub);font-size:11px;line-height:1.7}
.liangxiang-market-footer{display:flex;align-items:flex-start;gap:18px;border-top:1px solid var(--liangxiang-market-border);padding-top:10px;margin-top:2px;color:var(--liangxiang-market-sub);font-size:11px;line-height:1.7}
.liangxiang-market-footer summary{cursor:pointer;white-space:nowrap}
.liangxiang-market-history{flex:1;min-width:0}
.liangxiang-market-rules{flex:1;min-width:0}
.liangxiang-market-footer details p{font-size:11px;line-height:1.8;margin:9px 0}
.liangxiang-market-connection{margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums}
.liangxiang-market-connection i{display:inline-block;width:5px;height:5px;margin-right:5px;border-radius:50%;background:#4d6bfe;vertical-align:middle}
.liangxiang-market-receipt{border-bottom:1px solid var(--liangxiang-market-border);padding:10px 0;font-size:11px}
.liangxiang-market-receipt small{font-size:11px;color:var(--liangxiang-market-sub)}
.liangxiang-market-notice{border-radius:10px;background:var(--liangxiang-market-pond-bg);padding:10px 13px;margin:10px 0;color:var(--liangxiang-market-sub);font-size:11px;line-height:1.7}
[data-liangxiang-market-dialog][data-animated=true] .liangxiang-market-volume-bubble[data-active=true]{animation:liangxiang-market-volume-float 4.5s ease-in-out infinite}
@keyframes liangxiang-market-volume-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
${MARKET_MOTION_CSS}
@media(max-width:580px){[data-liangxiang-market-dialog]{padding:14px 12px 10px;max-height:calc(100dvh - 24px);border-radius:14px}.liangxiang-market-header{gap:8px;flex-wrap:wrap}.liangxiang-market-header-copy{flex-basis:45%}.liangxiang-market-header h2{font-size:16px}.liangxiang-market-header-copy p{font-size:10px}.liangxiang-market-wallet{gap:8px;margin-left:auto}.liangxiang-market-wallet [data-liangxiang-market-available]{font-size:19px}.liangxiang-market-header .liangxiang-market-motion{margin-left:auto}.liangxiang-market-stage-tabs strong{font-size:11px}.liangxiang-market-stage-tabs small{font-size:10px}.liangxiang-market-stage-tabs button{gap:4px;flex-direction:column;padding:8px 3px}.liangxiang-market-order{gap:6px;flex-wrap:wrap}.liangxiang-market-direction{flex:1}.liangxiang-market-direction button{flex:1}.liangxiang-market-amount{flex:1}.liangxiang-market-order .liangxiang-market-primary{flex:1}.liangxiang-market-position{gap:8px}.liangxiang-market-position small{margin-left:0}.liangxiang-market-footer{gap:10px;flex-wrap:wrap}.liangxiang-market-connection{font-size:10px}}
@media(prefers-reduced-motion:reduce){[data-liangxiang-market-dialog] *,[data-liangxiang-market-dialog] *::before,[data-liangxiang-market-dialog] *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
@media(max-width:580px){.liangxiang-market-depth-label[data-active=false],.liangxiang-market-depth-range,.liangxiang-market-current-badge,.liangxiang-market-depth-caption,.liangxiang-market-chart-hint{display:none}.liangxiang-market-depth-label[data-active=true] rect{transform:scaleY(1.4)}.liangxiang-market-depth-label[data-active=true] text{font-size:19px}.liangxiang-market-phone-current{display:inline;color:var(--liangxiang-market-ink);font-size:11px;font-variant-numeric:tabular-nums}.liangxiang-market-pond-legend{gap:5px 10px;font-size:10px}.liangxiang-market-provenance{margin-left:0}}
`
