# 1.2.0 发布准备

核对日期：2026-10-19；源码候选 **1.2.0-rc.8**，正式目标 **1.2.0**。
候选代码、合入主线、npm/Release 与生产部署分别核验。公开正式包仍为 **1.1.6**。

## 功能与修复

| 项目 | 当前行为 |
|---|---|
| 小难梁 | 有票且梁位 <25%；25%–<50% 为梁工；旧案、旧档案与旧客户端按原规则兼容 |
| PR #7 用量 | 支持新版内嵌最终用量；失败、重试与取消按实际用量结算一次，会话格式迁移保守重建游标 |
| 日终上香 | 默认关闭，Host 运行时按业务时区 23:59 发一笔普通倾炉；右键设夯/拉、整格切开关、说明仅悬停显示 |
| 并发与恢复 | 手动优先，完成后至少等 2 秒；异步准备后重新检查，持久化同一意图重试，不跨日补投 |
| 模型规则 | Pro ×1；V4.1 Flash 新旧别名、其他及未知 ×0.5，非法路由不冒领 Pro 倍率；倍率不是 API 价格 |
| 连接 | 只过滤除 revision 外完全相同的 SSE 状态帧；所有业务变化即时送达，权威刷新、心跳和重连保持原语义 |
| PR #6 交互 | 200ms 单击开合、双击/连拍不改变开关；主面板固定，三行短句下落与 420ms 渐隐 |
| 更新说明 | 按版本显示一次并可重看；保留 QQ 二维码与 @XChen446、@Ritanlisa、@xunxiaoQ 鸣谢 |
| 安装资料 | Desktop 原生插件市场优先，Cmd 单独说明；校验安装/更新/卸载，增加 Host 网络与代理排障 |

## 验证入口

```text
pnpm run verify
pnpm run smoke:browser-clean-profile
pnpm run smoke:online
node --test scripts/ci/nightly-promotion.test.mjs scripts/ci/check-privacy.test.mjs
node scripts/ci/check-privacy.mjs --pre-commit
```

测试使用隔离的 Profile、SQLite、HTTP 服务与模拟业务时钟。窗口内恢复、跨日恢复、
手动长请求、异步准备期间的新手动操作、重放和故障均有回归；这不等于整夜公网运行实测。

通信计数回归中，两标签页收到 60 次内容相同的通知时，完整状态帧合计 **122 → 2**；
此为固定输入对照，不承诺线上固定降幅。服务器请求节奏没有为减量而延长。

## 发布边界

集成使用个人 fork → `dev` → 固定批次 → `main`；必须通过三平台、隐私和完整安装门禁，
不强推、不跳过分支保护。检查记录以 [CI 工作流](https://github.com/liang-today/dsh-liangxiang/actions/workflows/ci.yml)
与 [批次工作流](https://github.com/liang-today/dsh-liangxiang/actions/workflows/nightly-promotion.yml) 为准。

官网安装与网络说明使用当前公开版本事实；正式 1.2.0 发布时才同步版本入口与小难梁公开展示。
本轮准备不执行 npm publish、GitHub Release、Tag 或社区服务器部署。
