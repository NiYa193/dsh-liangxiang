# PR #7 — DSH 用量结算与兼容验证

来源：[PR #7](https://github.com/liang-today/dsh-liangxiang/pull/7)。
感谢 [@XChen446](https://github.com/XChen446) 的问题定位、平台兼容修正和 CI 建议。

## 修复结果

DSH 0.2 将用量流写入持久化的 `assistant/message`、`assistant/attempt`，
不再持久化独立的 `assistant/chunk`。结算同时覆盖成功、失败、取消和重试尝试：
最终顶层 usage 优先，缺省时读取内嵌 stream 的最后一个 usage 样本。

例如失败尝试 50K、成功重试 40K，应结算 90K 原始 Token；Flash 对应 45K 当量。
不会因只读取成功消息而漏掉失败尝试，也不会因后续 retry 或 step/end 重复计香。
缓存读写全量计入输入，reasoning 不重复加入输出；未知用量不估算。
每次尝试使用自己的路由归属，不能用会话最后选中的模型重算整段历史。

## 迁移边界

- 结算游标与 `SessionHeader.version` 一起持久化。会话格式迁移重排事件序号时，
  建立当前历史基线，不跨格式取偏移最大值。
- 保留已有香火和已接受投票，不追溯补铸或扣减历史信用。保守迁移可能略过升级
  边界期间一次未补记请求，后续新请求正常结算。
- 同格式重启补记只处理未结算尝试；继承历史、重复 replay、在线/离线切换和跨日
  不重复铸香。旧 chunk 日志继续可读。
- 平台相关文件路径使用原生路径拼接，避免 Windows 分隔符导致断言错误。

只读源码基线为 DSH 0.2.1-rc.2 / `687f282e86`。主要证据：
`packages/llm/token-meter/src/usage-projection.ts` 的 `usageOf`、
`packages/core/session/src/types.ts`、`packages/core/agent-loop/src/agent.ts`
及 `packages/session/session-format-v1-to-v2/src/migration.ts`。
实现不修改 DSH，不读取或上传会话正文。

## 验证与 CI

- `tests/settled-usage.spec.ts` 使用钉住 DSH 的原生 Session / TokenMeter，覆盖最后
  样本下调、缓存四桶、内嵌流、重试、取消、旧日志、格式迁移、重启与重复补记。
- `tests/host-backend.spec.ts` 经真实本机 HTTP/SQLite 验证用量声明、赠香隔离、
  跨日最终到账、投票及静态规则；断言最终状态，不能以中间值掩盖漏记。
- Windows 路径与 CI 控制器回归保留在相应测试中；测试不接触真实社区身份或账本。
- 主仓合并门禁包含锁定依赖的 Linux / Windows / macOS 验证、隐私检查；main
  另要求真实安装包、浏览器及隔离在线回归。上游兼容预警独立运行，不替代锁定版门禁。

用量与迁移的针对性本机回归已通过；本次最终提交的 GitHub 集成检查结果须单独核验。
当前流水线规则见 [CI](CI.md)，完整候选验证矩阵见
[CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md)，结算规则见
[INCENSE_POLICY.md](INCENSE_POLICY.md)。CI 通过和源码合入均不等于正式发布。
