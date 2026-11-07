import { font } from '../theme.ts'
import { MARKET_MOTION_CSS } from './market-motion-style.ts'
import { COMPANION_CSS } from './MarketFishCompanion.tsx'

export const MARKET_DIALOG_CSS = `
[data-liangxiang-market-backdrop]{background-image:radial-gradient(#9cb4dc15 .8px,transparent 1px);background-size:14px 14px}
[data-liangxiang-market-dialog]{
 --liangxiang-market-paper:light-dark(#fffcf7,#222731);
 --liangxiang-market-paper-2:light-dark(#f0f4fb,#2b3443);
 --liangxiang-market-ink:light-dark(#30394b,#e7edf8);
 --liangxiang-market-sub:light-dark(#5c687b,#b1bfd2);
 --liangxiang-market-border:light-dark(#ced7e6,#465267);
 --liangxiang-market-gold:#dca858;
 --liangxiang-market-vermilion:light-dark(#b95440,#e39479);
 --liangxiang-market-slate:light-dark(#667f9c,#9fb6d2);
 --liangxiang-market-blue:#4d6bfe;
 --liangxiang-market-blue-text:light-dark(#3651b9,#a1b7ff);
 --liangxiang-market-water-top:#4d6bfe;
 --liangxiang-market-water-bottom:#729dff;
 --liangxiang-market-chart-text:var(--liangxiang-market-sub);
 box-sizing:border-box;position:relative;display:flex;flex-direction:column;
 width:min(880px,100%);height:min(600px,calc(100dvh - 24px));max-height:calc(100dvh - 24px);
 padding:12px 16px 8px;overflow:auto;scrollbar-width:thin;
 background:var(--liangxiang-market-paper);color:var(--liangxiang-market-ink);
 border:1px solid var(--liangxiang-market-border);border-radius:16px;
 box-shadow:0 3px 0 #24345229,0 16px 42px #081d4633;
 font:13px ${font.family};color-scheme:light dark;outline:none
}
[data-liangxiang-market-dialog][data-fullscreen=true]{width:100%;height:calc(100dvh - 24px)}
[data-liangxiang-market-dialog] *{box-sizing:border-box}
[data-liangxiang-market-dialog] [hidden]{display:none!important}
[data-liangxiang-market-dialog] :is(button,input,select){font:inherit}
[data-liangxiang-market-dialog] button{min-height:30px;padding:5px 9px;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer}
[data-liangxiang-market-dialog] button:disabled{opacity:.45;cursor:default}
[data-liangxiang-market-dialog] button:hover:not(:disabled){background:color-mix(in srgb,var(--liangxiang-market-blue) 8%,var(--liangxiang-market-paper))}
[data-liangxiang-market-dialog] :is(button,input,select,summary,svg):focus-visible{outline:2px solid var(--liangxiang-market-blue);outline-offset:3px}
.liangxiang-market-header{display:grid;grid-template-columns:minmax(0,1fr) auto auto 28px 28px;gap:8px;align-items:center;flex:none;height:64px}
.liangxiang-market-header-copy{min-width:0}
.liangxiang-market-header-title{display:flex;align-items:center;gap:8px;height:64px;min-width:0}
.liangxiang-market-header-caption{min-width:0;max-width:200px;flex:0 1 200px}
.liangxiang-market-header h2{margin:0;font-size:18px;font-weight:600}
.liangxiang-market-header-copy p{margin:3px 0 0;font-size:11px;line-height:1.4;color:var(--liangxiang-market-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.liangxiang-market-wallet{display:flex;align-items:baseline;gap:10px;white-space:nowrap;font-size:11px;color:var(--liangxiang-market-sub)}
.liangxiang-market-wallet strong{margin:0 3px;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--liangxiang-market-ink)}
.liangxiang-market-wallet [data-liangxiang-market-available]{font-size:20px;color:var(--liangxiang-market-blue-text)}
[data-liangxiang-market-dialog] .liangxiang-market-motion{display:flex;gap:4px;align-items:center;white-space:nowrap;padding:5px 7px;font-size:11px;background:var(--liangxiang-market-paper-2);color:var(--liangxiang-market-blue-text);border:1px solid var(--liangxiang-market-border);box-shadow:0 1px 0 var(--liangxiang-market-border)}
.liangxiang-market-motion>span{font-size:15px}
.liangxiang-market-dried-fish{filter:grayscale(1);transform:rotate(-18deg)}
[data-liangxiang-market-dialog] :is(.liangxiang-market-close,.liangxiang-market-fullscreen){padding:0;min-height:28px;min-width:28px;font-size:21px;color:var(--liangxiang-market-sub)}
[data-liangxiang-market-dialog] .liangxiang-market-close{border:1px solid var(--liangxiang-market-border);border-radius:50%;background:var(--liangxiang-market-paper-2)}
.liangxiang-market-status{position:absolute;z-index:7;left:16px;right:16px;bottom:44px;display:flex;align-items:center;gap:8px;padding:6px 9px;max-height:75px;overflow:auto;border:1px solid var(--liangxiang-market-border);border-radius:8px;background:var(--liangxiang-market-paper-2);color:var(--liangxiang-market-ink);font-size:11px;line-height:1.5;box-shadow:0 3px 12px #081d4620}
.liangxiang-market-status:empty{display:none}
.liangxiang-market-status button{flex:none;font-size:11px;min-height:25px;padding:3px 6px;color:var(--liangxiang-market-blue-text)}
.liangxiang-market-loading,.liangxiang-market-empty{flex:1;display:grid;place-items:center;color:var(--liangxiang-market-sub);font-size:12px}
.liangxiang-market-chart{display:flex;flex-direction:column;flex:1;min-height:250px;overflow:hidden}
.liangxiang-market-chart-toolbar{display:flex;justify-content:space-between;align-items:center;gap:7px;flex:none;height:32px;white-space:nowrap}
.liangxiang-market-chart-toolbar>div{display:flex;align-items:center;gap:2px;flex:none}
[data-liangxiang-market-dialog] .liangxiang-market-chart-toolbar button{min-height:26px;padding:3px 6px;font-size:11px;color:var(--liangxiang-market-sub)}
[data-liangxiang-market-dialog] button[data-selected=true]{background:var(--liangxiang-market-paper-2);color:var(--liangxiang-market-blue-text)}
.liangxiang-market-chart-range{margin-left:auto}
.liangxiang-market-chart-interval{width:88px;min-width:88px;flex:none;height:27px;border:1px solid var(--liangxiang-market-border);border-radius:7px;padding:3px 18px 3px 5px;background:var(--liangxiang-market-paper-2);color:var(--liangxiang-market-ink);font-size:11px!important;font-variant-numeric:tabular-nums}
.liangxiang-market-chart-quotes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) 1.1fr;gap:12px;flex:none;min-height:43px;padding:4px 0 7px;border-bottom:1px solid var(--liangxiang-market-border);font-variant-numeric:tabular-nums}
.liangxiang-market-chart-quotes span{display:block;margin-bottom:2px;font-size:11px;color:var(--liangxiang-market-sub)}
.liangxiang-market-chart-quotes b{font-size:12px;font-weight:600;white-space:nowrap}
.liangxiang-market-chart-quote-time{text-align:right}
.liangxiang-market-chart-scroll{flex:1;min-height:140px;overflow:hidden}
.liangxiang-market-chart-scroll>svg{width:100%;height:100%;display:block}
.liangxiang-market-chart-readout{flex:none;height:21px;min-width:0;padding:2px 0;font-size:11px;line-height:17px;color:var(--liangxiang-market-sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.liangxiang-market-chart-current{margin-right:9px;color:var(--liangxiang-market-ink)}
.liangxiang-market-pond-legend{display:flex;align-items:center;gap:5px 10px;flex-wrap:wrap;flex:none;min-height:18px;margin:0;padding:0;font-size:11px;color:var(--liangxiang-market-sub)}
.liangxiang-market-pond-legend span{display:inline-flex;align-items:center;gap:4px}
.liangxiang-market-pond-legend i{display:inline-block;width:6px;height:6px;flex:none;border-radius:50%}
.liangxiang-market-provenance{margin-left:auto}
.liangxiang-market-stage-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;flex:none;height:35px;margin-top:7px;padding:2px;background:var(--liangxiang-market-paper-2);border-radius:10px}
[data-liangxiang-market-dialog] .liangxiang-market-stage-tabs button{padding:0;min-width:0;min-height:29px;border-radius:8px;color:var(--liangxiang-market-sub)}
.liangxiang-market-stage-tabs .liangxiang-market-button-face{display:flex;align-items:center;justify-content:center;gap:7px;height:29px;padding:3px 5px;white-space:nowrap}
.liangxiang-market-stage-tabs strong{font-size:12px;font-weight:500}
.liangxiang-market-stage-tabs small{font-size:11px}
.liangxiang-market-batch-number{margin-right:4px;font-size:11px}
[data-liangxiang-market-dialog] .liangxiang-market-stage-tabs [aria-selected=true]{background:var(--liangxiang-market-paper);color:var(--liangxiang-market-blue-text);box-shadow:0 1px 2px #081d461f,inset 0 -2px 0 color-mix(in srgb,var(--liangxiang-market-blue) 65%,transparent)}
.liangxiang-market-stage{flex:none;height:110px}
.liangxiang-market-batch{position:relative;height:110px;padding:8px 0 4px;min-width:0}
.liangxiang-market-batch-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;height:22px;margin-bottom:6px;font-size:11px;color:var(--liangxiang-market-sub)}
.liangxiang-market-batch-meta p{min-width:0;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.liangxiang-market-pool-info{position:relative;flex:none}
.liangxiang-market-pool-info summary{list-style:none;white-space:nowrap;cursor:pointer}
.liangxiang-market-pool-detail{position:absolute;z-index:6;right:0;bottom:22px;min-width:145px;padding:9px 12px;background:var(--liangxiang-market-paper);border:1px solid var(--liangxiang-market-border);border-radius:9px;box-shadow:0 4px 16px #081d4626;line-height:1.8}
.liangxiang-market-order{display:grid;grid-template-columns:minmax(142px,1fr) minmax(128px,160px) 100px;gap:8px;align-items:center;height:37px}
.liangxiang-market-direction{display:grid;grid-template-columns:1fr 1fr;gap:4px;max-width:220px;padding:2px;background:var(--liangxiang-market-paper-2);border-radius:9px}
[data-liangxiang-market-dialog] .liangxiang-market-direction button{min-height:32px;min-width:0;padding:0;border-radius:7px;color:var(--liangxiang-market-sub);border:1px solid transparent}
.liangxiang-market-direction .liangxiang-market-button-face{display:flex;justify-content:center;align-items:center;min-height:29px;padding:4px 8px;white-space:nowrap;transform:translateY(-1px)}
[data-liangxiang-market-dialog] .liangxiang-market-direction [aria-pressed=true]{background:var(--liangxiang-market-paper);color:var(--liangxiang-market-blue-text);border-color:color-mix(in srgb,var(--liangxiang-market-blue) 35%,var(--liangxiang-market-border));box-shadow:0 2px 0 color-mix(in srgb,var(--liangxiang-market-blue) 25%,var(--liangxiang-market-border))}
.liangxiang-market-amount{display:flex;align-items:center;gap:6px;height:34px;padding:0 9px;border:1px solid var(--liangxiang-market-border);border-radius:9px;background:var(--liangxiang-market-paper-2);font-size:11px;color:var(--liangxiang-market-sub)}
.liangxiang-market-amount>span{flex:none;white-space:nowrap}
.liangxiang-market-amount input{width:100%;min-width:0;height:30px;padding:2px 0;border:0;background:transparent;color:var(--liangxiang-market-ink);font-size:13px!important;font-variant-numeric:tabular-nums;text-align:right;outline-offset:1px!important}
[data-liangxiang-market-dialog] .liangxiang-market-primary{min-height:34px;padding:0;background:#304daf;color:#fff;border-radius:9px;box-shadow:0 2px 0 #263f93}
[data-liangxiang-market-dialog] .liangxiang-market-primary:hover:not(:disabled){background:#3d59bd}
.liangxiang-market-primary .liangxiang-market-button-face{display:flex;align-items:center;justify-content:center;min-height:34px;padding:5px 10px;border-radius:8px;border:1px solid #ffffff25;background:linear-gradient(180deg,#5270d8,#3c58bd);box-shadow:inset 0 1px 0 #ffffff30;transform:translateY(-2px);font-size:12px;white-space:nowrap}
[data-liangxiang-market-dialog] button:active:not(:disabled)>.liangxiang-market-button-face{transform:translateY(0) scale(.98)}
[data-animated=true] .liangxiang-market-button-face{transition:transform 180ms cubic-bezier(.2,.8,.3,1.3),background 120ms ease}
[data-animated=true] .liangxiang-market-direction [aria-pressed=true]{transition:background 180ms ease,box-shadow 180ms ease}
.liangxiang-market-ticket-footer{display:flex;align-items:center;gap:8px;height:29px;margin-top:3px;min-width:0}
.liangxiang-market-position{display:flex;align-items:center;gap:7px;flex:1;flex-wrap:wrap;min-width:0;max-height:29px;overflow:auto;font-size:11px;color:var(--liangxiang-market-sub);line-height:14px}
.liangxiang-market-position strong{font-size:11px;font-weight:500;color:var(--liangxiang-market-ink)}
.liangxiang-market-position [data-mood]{color:var(--liangxiang-market-blue-text)}
.liangxiang-market-position small{font-size:11px}
.liangxiang-market-order-hint{margin:0;font-size:11px;color:var(--liangxiang-market-sub)}
[data-liangxiang-market-dialog] .liangxiang-market-withdraw{flex:none;min-height:25px;padding:2px 5px;font-size:11px;color:var(--liangxiang-market-sub)}
.liangxiang-market-input-error:empty{display:none}
.liangxiang-market-input-error{position:absolute;left:0;right:0;bottom:2px;padding:3px 7px;border-radius:6px;font-size:11px;background:var(--liangxiang-market-paper-2);color:var(--liangxiang-market-ink)}
.liangxiang-market-footer{display:flex;align-items:center;gap:9px;position:sticky;bottom:-8px;z-index:5;flex:none;height:32px;margin:0;padding-top:3px;background:var(--liangxiang-market-paper);border-top:1px solid var(--liangxiang-market-border);font-size:11px;color:var(--liangxiang-market-sub)}
[data-liangxiang-market-dialog] .liangxiang-market-footer>button{min-height:27px;padding:3px 5px;font-size:11px;color:var(--liangxiang-market-sub)}
.liangxiang-market-connection{margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums}
.liangxiang-market-connection i{display:inline-block;width:5px;height:5px;margin-right:5px;border-radius:50%;background:var(--liangxiang-market-blue);vertical-align:middle}
.liangxiang-market-popover{position:absolute;z-index:8;left:0;bottom:38px;width:min(390px,100%);max-height:min(330px,calc(100dvh - 170px));padding:12px 14px;overflow:auto;border:1px solid var(--liangxiang-market-border);border-radius:11px;background:var(--liangxiang-market-paper);color:var(--liangxiang-market-ink);box-shadow:0 7px 24px #081d4630}
.liangxiang-market-popover-heading{display:flex;justify-content:space-between;align-items:center;gap:8px;min-height:28px}
[data-liangxiang-market-dialog] .liangxiang-market-popover-heading button{min-height:25px;padding:0 5px;font-size:19px}
.liangxiang-market-popover p{margin:7px 0;font-size:12px;line-height:1.7}
.liangxiang-market-receipt{padding:8px 0;border-bottom:1px solid var(--liangxiang-market-border);font-size:11px}
.liangxiang-market-receipt small{font-size:11px;color:var(--liangxiang-market-sub)}
${MARKET_MOTION_CSS}
${COMPANION_CSS}
@media(max-width:760px){
 .liangxiang-market-header{grid-template-columns:minmax(0,1fr) auto 28px 28px;height:98px;gap:3px 6px}
 .liangxiang-market-header-copy{grid-column:1/-1}
 .liangxiang-market-header-title{height:62px}
}
@media(max-width:580px){
 [data-liangxiang-market-dialog]{height:min(640px,calc(100dvh - 24px));padding:10px 12px 7px;border-radius:13px}
 .liangxiang-market-header{grid-template-columns:minmax(0,1fr) auto 28px 28px;height:102px;gap:3px 6px}
 .liangxiang-market-header-copy{grid-column:1/-1}
 .liangxiang-market-header-caption{max-width:220px}
 .liangxiang-market-header h2{font-size:17px}
 .liangxiang-market-header-title{height:62px}
 .liangxiang-market-wallet{gap:8px}
 .liangxiang-market-wallet [data-liangxiang-market-available]{font-size:18px}
 .liangxiang-market-chart{min-height:285px}
 .liangxiang-market-chart-toolbar{display:grid;grid-template-columns:1fr auto;grid-template-rows:28px 29px;height:59px;gap:0 5px}
 .liangxiang-market-chart-toolbar .liangxiang-market-chart-range{grid-column:1/-1;justify-content:flex-end;width:100%;margin:0}
 .liangxiang-market-chart-quotes{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;min-height:42px}
 .liangxiang-market-chart-quote-time{display:none}
 .liangxiang-market-chart-quotes b{font-size:12px}
 .liangxiang-market-stage-tabs{height:39px;margin-top:5px}
 .liangxiang-market-stage-tabs .liangxiang-market-button-face{height:33px;gap:4px;padding:3px}
 .liangxiang-market-stage-tabs strong,.liangxiang-market-stage-tabs small{font-size:11px}
 .liangxiang-market-batch-number{margin-right:2px}
 .liangxiang-market-stage,.liangxiang-market-batch{height:110px}
 .liangxiang-market-order{grid-template-columns:minmax(128px,1fr) minmax(118px,140px) 91px;gap:6px}
 .liangxiang-market-primary .liangxiang-market-button-face{padding:5px 6px}
 .liangxiang-market-provenance{display:none}
 .liangxiang-market-status{left:12px;right:12px}
}
@media(max-width:420px){
 [data-liangxiang-market-dialog]{height:min(690px,calc(100dvh - 24px));padding:9px 10px 6px}
 .liangxiang-market-header{height:132px}
 .liangxiang-market-wallet{grid-column:1/-1}
 .liangxiang-market-header .liangxiang-market-motion{grid-column:1/3;justify-self:start}
 .liangxiang-market-stage-tabs .liangxiang-market-button-face{flex-direction:column;gap:0;line-height:13px}
 .liangxiang-market-stage,.liangxiang-market-batch{height:146px}
 .liangxiang-market-order{grid-template-columns:minmax(124px,1fr) minmax(105px,1fr);grid-template-rows:34px 34px;gap:5px;height:73px}
 .liangxiang-market-order>.liangxiang-market-primary{grid-column:1/-1}
 .liangxiang-market-amount{padding:0 6px;gap:4px}
 .liangxiang-market-ticket-footer{height:31px;margin-top:3px}
 .liangxiang-market-position{max-height:31px}
 .liangxiang-market-chart-quotes b{font-size:11px}
 .liangxiang-market-footer{gap:4px;font-size:11px}
 [data-liangxiang-market-dialog] .liangxiang-market-footer>button{padding:3px 2px}
}
@media(prefers-reduced-motion:reduce){
 [data-liangxiang-market-dialog] *,[data-liangxiang-market-dialog] *::before,[data-liangxiang-market-dialog] *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}
`
