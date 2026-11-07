export const MARKET_MOTION_CSS = `
.liangxiang-market-current-whale{animation:none!important;transition:none}
.liangxiang-market-whale-breath{transform-box:fill-box;transform-origin:50% 68%}
.liangxiang-market-whale-ripple{transform-box:fill-box;transform-origin:center}
.liangxiang-market-current-whale[data-motion=true] .liangxiang-market-whale-breath{animation:liangxiang-market-breathe 3.8s ease-in-out infinite}
.liangxiang-market-current-whale[data-motion=true] .liangxiang-market-whale-tail{animation:liangxiang-market-tail 2.4s ease-in-out infinite}
.liangxiang-market-current-whale[data-motion=true] .liangxiang-market-whale-hair{animation:liangxiang-market-hair 3.1s ease-in-out infinite}
.liangxiang-market-current-whale[data-pose=dive][data-motion=true] .liangxiang-market-whale-tail{animation-duration:1.65s}
.liangxiang-market-current-whale[data-motion=true] .liangxiang-market-whale-ripple{animation:liangxiang-market-ripple 3.4s ease-in-out infinite}
.liangxiang-market-current-whale[data-pose=dive][data-motion=true] .liangxiang-market-whale-bubble{animation:liangxiang-market-dive-bubble 2.7s ease-out infinite}
.liangxiang-market-water-motion[data-motion=true] .liangxiang-market-water-back{animation:liangxiang-market-water-drift 8s ease-in-out infinite}
.liangxiang-market-water-motion[data-motion=true] .liangxiang-market-water-glint{animation:liangxiang-market-water-drift 6.5s ease-in-out infinite reverse}
.liangxiang-market-water-motion[data-motion=true] .liangxiang-market-water-specks{animation:liangxiang-market-water-specks 7s ease-in-out infinite}
@keyframes liangxiang-market-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.025,1.03)}}
@keyframes liangxiang-market-tail{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(16deg)}}
@keyframes liangxiang-market-hair{0%,100%{transform:rotate(3deg)}50%{transform:rotate(-7deg)}}
@keyframes liangxiang-market-ripple{0%,100%{transform:scaleX(.84);opacity:.5}50%{transform:scaleX(1.2);opacity:1}}
@keyframes liangxiang-market-dive-bubble{0%{transform:translateY(4px);opacity:.2}25%{opacity:.9}100%{transform:translate(3px,-20px);opacity:0}}
@keyframes liangxiang-market-water-drift{0%,100%{transform:translateX(-9px);opacity:.5}50%{transform:translateX(9px);opacity:1}}
@keyframes liangxiang-market-water-specks{0%,100%{transform:translateY(2px);opacity:.28}50%{transform:translateY(-4px);opacity:.52}}
@media(prefers-reduced-motion:reduce){.liangxiang-market-current-whale *,.liangxiang-market-water-motion *{animation:none!important;transition:none!important}}
`
