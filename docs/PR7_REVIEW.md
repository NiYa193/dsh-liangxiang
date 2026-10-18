# PR #7：DSH 0.2 用量漏算与验证补齐

核对日期：2026-10-19。审查 PR head `f2306e6afb3547eefecd1012550edcea73d14fa2`，
原始 main 基线 `9e45c72512ed4a648096d366405bceb835ba2e38`；本轮从候选
`c4203605f25507dc36070128133c0cf91eeac47b` 开始。感谢 @XChen446 的问题定位和方案。

## 用户影响与处理结果

DSH 0.2 不再持久化独立的 `assistant/chunk`。旧结算器忽略失败/重试尝试的
`assistant/attempt.stream`，message 缺少顶层 usage 时也遗漏其 stream 样本。
例如失败 50K + 成功 40K，本应记录 90K 原始 Token，旧路径只记录 40K；Flash
对应 45K 当量与 20K 当量。用户会少凝香、下一炷进度偏低，可用投票香火也可能减少。
这不会改变已经接受的票数或直接改写全局梁位。

当前候选已在 `7949610` 完成内嵌用量读取及会话格式迁移保护，本轮保留其实现，
补齐 PR #7 的独立回归并记录 CI 方案。代码、包号和现有产品行为不另行改写，保持
`1.2.0-rc.3` / `SERVER_BUILD=1.2.0-rc.3-u1`。正式公开版和运行中的手测服务
不会因为本次验证/推送自动升级。

## 源码依据与边界

上游只读源码：DSH `0.2.1-rc.2` / `687f282e8625c6b8d11ff58211a90524be2e4317`。

- `packages/llm/token-meter/src/usage-projection.ts` 的 `usageOf`：message 顶层
  usage 优先，否则读取 stream 最后一个 usage chunk；缓存读写计入输入。
- `packages/core/session/src/types.ts` 的 assistant 事件，以及
  `packages/core/agent-loop/src/agent.ts` 的结算：message/attempt 是持久化终态。
  当前候选在该终态结算，之后 retry/step/end 不再重复计入；旧 chunk 路径保留。
- `packages/session/session-format-v1-to-v2/src/migration.ts` 保留 session ID、
  重排事件序号。因此游标必须同时记录 SessionHeader.version，不能跨格式取偏移最大值。
- `src/host/usage-ledger.ts`、`src/compat/dsh/usage-observer.ts` 和 storage codec
  已携带格式并重建升级基线；保留既有香火，不追溯补铸或扣减历史信用。
  升级时的保守基线可能略过边界期间一次未补记请求，后续新请求正常计入。

## 本轮补充

1. 原生 DSH 测试去掉不存在的旧 chunk 兜底，用纯新版事件验证重试 90K、
   最后样本下调、缓存四桶、取消和 message 无顶层 usage；旧格式单独测试。
2. 经真实 observer 验证无格式旧游标和 format 1 游标迁移到当前格式：保留已有
   50K 当量、跳过旧历史、计入新请求，重启后不重复计入，后续请求继续增长。
3. 跨日 HTTP 测试等待最终 2,000，当第二笔漏记时不能以中间态 1,000 通过。
4. 文件日志路径期望使用平台路径拼接，采纳 PR 的 Windows 兼容修正。
5. 三平台 CI 方案分 locked / alpha 两路：锁定依赖完整 verify 为门禁；alpha
   先解析一次 CLI 版本，四个 DSH 包使用同一精确版本，完整 verify 作为非阻断预警。
   不再只有“按锁文件安装、升级后才测试”。遵守 pnpm 安装政策，不添加发布或部署。
   首次推送被 GitHub 明确拒绝：当前 OAuth 授权缺少 workflow scope。本轮不启用
   工作流，方案保存在 `PR7_CI_PROPOSAL.yml` 供后续审阅，不阻塞修复/测试代码同步。
   不宣称本轮已完成 Windows/Linux 实测。

## 验证记录

- Node 22.23.1 / pnpm 11.7.0，锁定 DSH 0.2.1-rc.2。
- `pnpm run verify`：53 个测试文件、619 项测试通过；类型、lint、构建及客户端预算通过。
  客户端 raw 610,849 B，gzip 395,115 B，预算保持 700 KB / 400 KB。
- 故障注入：恢复原 main 的旧结算器，4 个新版路径回归失败；关闭会话格式保护，
  2 个真实 observer 迁移/重启回归失败。已恢复修复实现，再运行完整验证通过。
- `LIANGXIANG_SMOKE_PORT=3987 LIANGXIANG_SMOKE_BROWSER=1 pnpm run smoke:clean-profile`：
  打包、干净 Profile 安装、Host 激活、所服务客户端产物一致性检查通过；桌面、窄屏、
  暗色浏览器共 62 项通过、1 项按 DSH 窄屏设计跳过。
- `LIANGXIANG_SMOKE_BACKEND_PORT=4187 LIANGXIANG_SMOKE_ONLINE_PORT=3988 pnpm run smoke:online`：
  仅 localhost 的临时数据库/Profile 通过 150K 凝成 3 炷、重复请求只扣一次、
  余额为 1 时 50 个并发请求仅接受 1 个、快照按节奏发布。临时服务已清理。
- CI 方案通过 YAML 语法检查，尚未启用；未把本机验证冒充 GitHub 三平台执行结果。

## 接续开发

共享开发分支是 `codex/pr-6-dsh-latest`；本轮在 `codex/pr-7-usage-fix` 的独立
工作区开发，验证后同步回共享分支并推送。后续 Agent 先核对分支提交和此记录，
保留徽标交互、小难梁、既有 DSH 适配和迁移保护。不得用 PR 原稿覆盖当前兼容层。
本轮不触碰 3080/4186 手测服务、原 Profile、公共 main、npm 或生产环境；PR 保持开启。
