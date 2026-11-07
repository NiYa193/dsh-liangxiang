import { font } from '../theme.ts'
import { MARKET_MOTION_CSS } from './market-motion-style.ts'

export const MARKET_DIALOG_CSS = `
[data-liangxiang-market-backdrop]{background-image:radial-gradient(#9cb4dc1a .8px,transparent 1px);background-size:14px 14px}
[data-liangxiang-market-dialog]{
  --liangxiang-market-paper:light-dark(#fffcf5,#222731);
  --liangxiang-market-paper-2:light-dark(#eff3fb,#2c3544);
  --liangxiang-market-ink:light-dark(#30394b,#e7edf8);
  --liangxiang-market-sub:light-dark(#626e80,#b2bfd2);
  --liangxiang-market-border:light-dark(#cbd4e5,#46546a);
  --liangxiang-market-gold:#e2ae54;
  --liangxiang-market-vermilion:#c44836;
  --liangxiang-market-slate:#61718b;
  --liangxiang-market-blue:#4d6bfe;
  --liangxiang-market-blue-text:light-dark(#3651b9,#a1b7ff);
  --liangxiang-market-water-top:#4d6bfe;
  --liangxiang-market-water-bottom:#729dff;
  --liangxiang-market-chart-text:var(--liangxiang-market-sub);
  box-sizing:border-box;
  color:var(--liangxiang-market-ink);
  font:13px ${font.family};
  color-scheme:light dark;
  width:min(920px,100%);
  height:min(760px,calc(100dvh - 24px));
  max-height:calc(100dvh - 24px);
  display:flex;
  flex-direction:column;
  position:relative;
  overflow:auto;
  scrollbar-width:thin;
  background:var(--liangxiang-market-paper);
  border:1.5px solid var(--liangxiang-market-border);
  border-radius:18px;
  padding:18px 20px 12px;
  box-shadow:inset 0 1px 0 #ffffff24,0 4px 0 #24345235,0 18px 44px #081d463d;
  outline:none
}
[data-liangxiang-market-dialog] *{box-sizing:border-box}
[data-liangxiang-market-dialog] :is(button,input){font:inherit}
[data-liangxiang-market-dialog] button{cursor:pointer;border:0;background:transparent;color:var(--liangxiang-market-ink);border-radius:9px;padding:7px 11px;min-height:32px}
[data-liangxiang-market-dialog] button:hover:not(:disabled){background:color-mix(in srgb,#4d6bfe 9%,var(--liangxiang-market-paper))}
[data-liangxiang-market-dialog] button:disabled{opacity:.45;cursor:default}
[data-liangxiang-market-dialog] :is(button,input,summary,svg):focus-visible{outline:2px solid #4d6bfe;outline-offset:3px}
.liangxiang-market-header{display:flex;align-items:center;gap:9px;margin-bottom:0;flex:none;height:88px}
.liangxiang-market-header-copy{flex:1;min-width:90px}
.liangxiang-market-header-title{display:flex;align-items:center;gap:8px;height:88px}
.liangxiang-market-header-caption{min-width:0;max-width:190px}
.liangxiang-market-header h2{margin:0;font-size:18px;font-weight:600;letter-spacing:.2px}
.liangxiang-market-header-copy p{margin:4px 0 0;font-size:11px;color:var(--liangxiang-market-sub);max-width:310px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.liangxiang-market-wallet{display:flex;align-items:baseline;gap:14px;white-space:nowrap;color:var(--liangxiang-market-sub);font-size:11px}
.liangxiang-market-wallet strong{color:var(--liangxiang-market-ink);font-variant-numeric:tabular-nums;font-size:15px;margin:0 3px;font-weight:650}
.liangxiang-market-wallet [data-liangxiang-market-available]{color:var(--liangxiang-market-blue-text);font-size:22px}
[data-liangxiang-market-dialog] .liangxiang-market-motion{font-size:11px;color:var(--liangxiang-market-blue-text);padding:5px 8px;white-space:nowrap;display:flex;align-items:center;gap:5px;border:1px solid var(--liangxiang-market-border);background:var(--liangxiang-market-paper-2);box-shadow:0 2px 0 var(--liangxiang-market-border)}
[data-liangxiang-market-dialog] .liangxiang-market-close{font-size:22px;color:var(--liangxiang-market-sub);padding:0;min-width:28px;min-height:28px;border:1.5px solid var(--liangxiang-market-border);border-radius:50%;background:var(--liangxiang-market-paper-2);box-shadow:0 1px 0 var(--liangxiang-market-border)}
.liangxiang-market-chart{overflow:hidden;flex:1;min-height:280px;display:flex;flex-direction:column}
.liangxiang-market-chart-toolbar{display:flex;align-items:center;gap:4px;padding:0;flex:none;height:34px;justify-content:space-between;white-space:nowrap}
.liangxiang-market-chart-readout{flex:none;min-width:0;font-size:11px;color:var(--liangxiang-market-sub);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;height:22px;padding:2px 0}
[data-liangxiang-market-dialog] .liangxiang-market-chart-toolbar button{padding:2px 7px;min-height:23px;font-size:11px;color:var(--liangxiang-market-sub)}
[data-liangxiang-market-dialog] button[data-selected=true]{background:color-mix(in srgb,#4d6bfe 12%,var(--liangxiang-market-paper));color:var(--liangxiang-market-ink);font-weight:650}
.liangxiang-market-chart-scroll{overflow:hidden;flex:1;min-height:150px}
.liangxiang-market-chart figcaption{padding:0;font-size:11px;color:var(--liangxiang-market-sub);line-height:1.5;flex:none;min-height:20px}
.liangxiang-market-pond-legend{display:flex;align-items:center;flex-wrap:wrap;gap:5px 11px}
.liangxiang-market-pond-legend span{display:inline-flex;align-items:center;gap:5px}
.liangxiang-market-pond-legend i{display:inline-block;width:6px;height:6px;flex:none;border-radius:50%}
.liangxiang-market-provenance{margin-left:auto;font-variant-numeric:tabular-nums}
.liangxiang-market-stage-tabs{display:flex;gap:8px;margin:8px 0 0;flex:none;height:48px}
[data-liangxiang-market-dialog] .liangxiang-market-stage-tabs button{position:relative;flex:1;display:flex;align-items:center;justify-content:center;padding:0;border-radius:11px;background:var(--liangxiang-market-border);color:var(--liangxiang-market-sub);min-width:0}
.liangxiang-market-stage-tabs strong{font-size:12px;font-weight:600}
.liangxiang-market-stage-tabs small{font-size:11px}
[data-liangxiang-market-dialog] .liangxiang-market-stage-tabs [aria-selected=true]{background:#27429c;box-shadow:0 1px 0 #27429c}
.liangxiang-market-batch{padding:8px 0 2px;min-width:0;height:144px}
.liangxiang-market-batch-meta{display:flex;justify-content:space-between;gap:7px;color:var(--liangxiang-market-sub);font-size:11px;line-height:1.6;height:30px;margin:0;align-items:start}
.liangxiang-market-batch-meta p{margin:0;overflow:auto;max-height:30px;line-height:1.35}
.liangxiang-market-pool-info{position:relative;flex-shrink:0}
.liangxiang-market-pool-info summary{cursor:pointer;list-style:none;white-space:nowrap}
.liangxiang-market-pool-info[open] .liangxiang-market-pool-detail{position:absolute;right:0;top:22px;z-index:5;min-width:150px;padding:10px 13px;border-radius:10px;border:1px solid var(--liangxiang-market-border);background:var(--liangxiang-market-paper);box-shadow:0 5px 20px #0002;line-height:1.9}
.liangxiang-market-position{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;margin:0 0 5px;height:31px;overflow:auto;align-content:center}
.liangxiang-market-position [data-mood]{color:var(--liangxiang-market-blue-text);font-weight:600}
.liangxiang-market-position small{color:var(--liangxiang-market-sub);margin-left:auto}
.liangxiang-market-order{display:flex;align-items:center;gap:7px;height:42px}
.liangxiang-market-direction{display:flex;gap:7px}
[data-liangxiang-market-dialog] .liangxiang-market-direction button{white-space:nowrap;padding:0;min-height:32px;color:var(--liangxiang-market-sub);background:var(--liangxiang-market-border);min-width:73px;box-shadow:0 2px 0 var(--liangxiang-market-border)}
[data-liangxiang-market-dialog] .liangxiang-market-direction button[aria-pressed=true]{background:#263e9a;color:#fff;box-shadow:0 2px 0 #263e9a}
.liangxiang-market-amount{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex:1;min-width:100px;color:var(--liangxiang-market-sub);font-size:11px}
.liangxiang-market-amount input{width:100%;max-width:94px;min-width:50px;height:35px;border:1px solid var(--liangxiang-market-border);border-radius:9px;padding:6px 9px;background:var(--liangxiang-market-paper);color:var(--liangxiang-market-ink);font-variant-numeric:tabular-nums}
[data-liangxiang-market-dialog] .liangxiang-market-primary{background:#243e9a;color:#fff;padding:0;min-height:38px;white-space:nowrap;font-weight:600;box-shadow:0 3px 7px #16286124}
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
[data-liangxiang-market-dialog] .liangxiang-market-stage-tabs button:active{transform:translateY(2px);box-shadow:none}
[data-liangxiang-market-dialog] .liangxiang-market-withdraw{font-size:11px;color:var(--liangxiang-market-sub);padding:3px 0;white-space:nowrap;width:32px;flex:none}
.liangxiang-market-order-hint{margin:5px 0 0;color:var(--liangxiang-market-sub);font-size:11px;line-height:1.35;height:27px;overflow:auto}
.liangxiang-market-idle{margin:0;color:var(--liangxiang-market-sub);line-height:1.7}
.liangxiang-market-footer{display:flex;align-items:center;gap:10px;border-top:1px solid var(--liangxiang-market-border);color:var(--liangxiang-market-sub);font-size:11px;line-height:1.7;flex:none;height:36px;padding:4px 0 0;margin:0;position:sticky;bottom:-12px;z-index:4;background:var(--liangxiang-market-paper)}
.liangxiang-market-connection{margin-left:auto;white-space:nowrap;font-variant-numeric:tabular-nums}
.liangxiang-market-connection i{display:inline-block;width:5px;height:5px;margin-right:5px;border-radius:50%;background:#4d6bfe;vertical-align:middle}
.liangxiang-market-receipt{border-bottom:1px solid var(--liangxiang-market-border);padding:10px 0}
.liangxiang-market-receipt small{color:var(--liangxiang-market-sub)}
[data-liangxiang-market-dialog] [hidden]{display:none!important}
[data-liangxiang-market-dialog][data-fullscreen=true]{width:100%;height:calc(100dvh - 24px);max-width:none}
.liangxiang-market-header-fish{position:relative;flex:none;width:86px;height:88px;padding-top:14px}
.liangxiang-market-header-fish>svg{display:block;width:86px;height:74px;overflow:visible}
.liangxiang-market-fish-reply{position:absolute;top:-1px;left:16px;right:0;text-align:center;line-height:14px;font-size:11px;color:var(--liangxiang-market-blue-text);pointer-events:none;opacity:0}
.liangxiang-market-fish-reaction{transform-box:fill-box;transform-origin:50% 80%}
[data-animated=true] .liangxiang-market-fish-reaction[data-active=true]{animation:liangxiang-market-greet 520ms cubic-bezier(.2,.8,.25,1)}
[data-animated=true] .liangxiang-market-fish-reply[data-active=true]{animation:liangxiang-market-reply 850ms ease-out}
.liangxiang-market-motion>span{font-size:17px}
.liangxiang-market-dried-fish{filter:grayscale(1);transform:rotate(-18deg)}
[data-liangxiang-market-dialog] .liangxiang-market-fullscreen{padding:0;min-width:28px;font-size:22px;color:var(--liangxiang-market-sub)}
.liangxiang-market-status{flex:none;display:flex;align-items:center;gap:8px;height:24px;font-size:11px;line-height:1.4;color:var(--liangxiang-market-sub);overflow:auto}
.liangxiang-market-status button{flex:none;padding:3px 6px;min-height:24px;background:var(--liangxiang-market-paper-2)!important}
.liangxiang-market-loading,.liangxiang-market-empty{flex:1;display:grid;place-items:center;color:var(--liangxiang-market-sub);font-size:12px}
.liangxiang-market-chart-toolbar>div{display:flex;align-items:center;gap:2px;flex:none}
.liangxiang-market-chart-toolbar .liangxiang-market-chart-range{margin-left:auto}
.liangxiang-market-chart-interval{width:48px;flex:none;color:var(--liangxiang-market-sub);font-size:11px}
.liangxiang-market-chart-quotes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) 1.15fr;gap:14px;flex:none;min-height:48px;padding:6px 0 8px;border-bottom:1px solid var(--liangxiang-market-border);font-variant-numeric:tabular-nums}
.liangxiang-market-chart-quotes span{display:block;color:var(--liangxiang-market-sub);font-size:11px;margin-bottom:3px}
.liangxiang-market-chart-quotes b{font-weight:600;white-space:nowrap}
.liangxiang-market-chart-quotes>div:last-child{text-align:right}
.liangxiang-market-chart-readout>span:first-child{color:var(--liangxiang-market-ink);margin-right:10px}
.liangxiang-market-stage-tabs .liangxiang-market-button-face{width:100%;height:44px;gap:7px;padding:6px}
[data-liangxiang-market-dialog] .liangxiang-market-stage-tabs [aria-selected=true]>.liangxiang-market-button-face{background:linear-gradient(180deg,#536fdc,#3c58cb);border-color:#3451bc;color:#fff;box-shadow:inset 0 1px 0 #ffffff66}
.liangxiang-market-stage{flex:none;height:144px}
[data-liangxiang-market-dialog] .liangxiang-market-footer>button{padding:3px 6px;color:var(--liangxiang-market-sub)}
.liangxiang-market-popover{position:absolute;z-index:6;left:0;bottom:42px;width:min(400px,100%);max-height:min(340px,calc(100dvh - 180px));overflow:auto;padding:13px 15px;background:var(--liangxiang-market-paper);border:1px solid var(--liangxiang-market-border);border-radius:12px;box-shadow:0 8px 26px #081d4633;color:var(--liangxiang-market-ink)}
.liangxiang-market-popover-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:30px}
.liangxiang-market-popover p{font-size:12px;line-height:1.7;margin:8px 0}
[data-liangxiang-market-dialog] .liangxiang-market-popover-heading button{font-size:20px;padding:0 5px;min-height:28px}
.liangxiang-market-receipt summary{white-space:nowrap}
@keyframes liangxiang-market-greet{0%,100%{transform:rotate(0) scale(1)}28%{transform:rotate(-9deg) scale(1.06,.94)}64%{transform:rotate(7deg) scale(.98,1.05)}}
@keyframes liangxiang-market-reply{0%{opacity:0;transform:translateY(3px)}18%,70%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-3px)}}

${MARKET_MOTION_CSS}
@media(max-width:580px){
  [data-liangxiang-market-dialog]{padding:10px 11px 6px;border-radius:14px}
  .liangxiang-market-header{flex-wrap:wrap;gap:5px;height:126px;align-content:center}
  .liangxiang-market-header-copy{flex-basis:100%}
  .liangxiang-market-header h2{font-size:16px}
  .liangxiang-market-header-copy p{max-width:180px}
  .liangxiang-market-wallet{gap:8px;margin-left:auto}
  .liangxiang-market-wallet [data-liangxiang-market-available]{font-size:19px}
  .liangxiang-market-order{flex-wrap:wrap;height:65px;gap:5px;align-content:center}
  .liangxiang-market-direction{flex:1;min-width:130px}
  .liangxiang-market-direction button{flex:1}
  .liangxiang-market-amount{min-width:95px}
  .liangxiang-market-order .liangxiang-market-primary{flex:1}
  .liangxiang-market-position{height:34px;gap:4px 7px}
  .liangxiang-market-position small{margin-left:0}
  .liangxiang-market-footer{gap:6px}
  .liangxiang-market-provenance{margin-left:0}
  .liangxiang-market-header-fish{height:88px}
  .liangxiang-market-header .liangxiang-market-close{margin-left:auto}
  .liangxiang-market-status{height:30px}
  .liangxiang-market-chart-toolbar{gap:3px}
  [data-liangxiang-market-dialog] .liangxiang-market-chart-toolbar button{padding:3px 5px;min-height:27px}
  .liangxiang-market-chart-toolbar .liangxiang-market-chart-zoom button{padding:2px 3px;min-width:23px}
  .liangxiang-market-chart-quotes{gap:8px;grid-template-columns:repeat(4,minmax(0,1fr));min-height:45px}
  .liangxiang-market-chart-quotes>div:last-child{display:none}
  .liangxiang-market-chart-quotes b{font-size:12px}
  .liangxiang-market-stage-tabs{height:49px;gap:6px;margin-top:6px}
  .liangxiang-market-stage-tabs strong{font-size:11px}
  [data-liangxiang-market-dialog] .liangxiang-market-stage-tabs button{padding:0;gap:2px}
  .liangxiang-market-stage-tabs .liangxiang-market-button-face{height:46px;flex-direction:column;gap:2px;padding:3px}
  .liangxiang-market-stage,.liangxiang-market-batch{height:172px}
  .liangxiang-market-amount input{max-width:70px;height:32px}
  .liangxiang-market-button-face{padding:5px 9px;min-height:30px}
  [data-liangxiang-market-dialog] .liangxiang-market-primary .liangxiang-market-button-face{min-height:30px;padding:5px 12px;transform:translateY(-2px)}
  .liangxiang-market-order-hint{margin-top:3px;height:30px}
  .liangxiang-market-popover{bottom:40px;width:100%}
}
@media(prefers-reduced-motion:reduce){
  [data-liangxiang-market-dialog] *,[data-liangxiang-market-dialog] *::before,[data-liangxiang-market-dialog] *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
}
@media(max-height:680px),(max-width:580px) and (max-height:800px){
  .liangxiang-market-chart{flex-shrink:0}
}
@media(max-width:380px){
  .liangxiang-market-header{height:162px;align-content:space-between}
  .liangxiang-market-wallet{flex-basis:100%;margin-left:0;justify-content:flex-start}
  .liangxiang-market-direction{min-width:124px}
  [data-liangxiang-market-dialog] .liangxiang-market-direction button{min-width:60px}
  .liangxiang-market-amount input{max-width:62px}
}
`
