# 连接与消息开销

## 本轮改进

Host 保持原有权威刷新节奏，只省去内容完全相同的 SSE 状态帧。
比较完整 wire 的全部字段，仅排除过程内递增的 `revision`；没有删减字段或改用差量协议。
每次新连接仍发送完整状态，25 秒心跳保留。

真实 HTTP/SSE 双标签页回归中，首次连接后连续触发 60 次内容相同的权威读取通知：

| 项目 | 优化前 | 优化后 |
| --- | ---: | ---: |
| 每标签页完整状态帧 | 61 | 1 |
| 两标签页合计完整状态帧 | 122 | 2 |
| 权威读取通知 | 60 | 60 |
| 心跳、初次连接、重连完整状态 | 保留 | 保留 |

这是固定输入下的帧数回归，不代表线上流量的固定降幅。真正变化的每一帧仍立即发送：
香火余额与凝香进度、同版梁位、统计、广播发布和失效、日终偏好、档案游标、刷新节奏、
在线可用性、模式及 Host epoch。重连接受新 epoch 的低 revision，旧帧拦截规则不变。

## 保留的连接行为

- 每个 Host 一条权威快照计时器，采用后端 cadence；标签页数量不会增加该定时器。
  默认 1 秒一次快照，每 5 个 tick 补读个人账本，避免其他 Host 的余额变化长期不可见。
  默认稳定期约为每分钟 60 次快照和 12 次个人读取，启动、操作与失败重试另计。
- 每标签页初次读取状态与独立档案冷通道，再用一条 SSE 接收状态；没有浏览器后台轮询。
  档案后续仅按 `archive_version` 拉取增量，不塞进日常状态帧。
- 悬停刷新受 `max(2 秒, 后端 cadence)` 限制；显式打开立即刷新。
  并发 bootstrap、snapshot、history 已合并在各自现有入口，避免重复在途读取。
- Token 声明合并 1 秒内的连续结算，内容未增长时不提交；投票先冲刷尚未提交的声明。
  倾炉与日终上香复用一笔 `count` 意图，不按香火数量循环发请求。
- 日终关闭时没有排期请求；开启后日间只有 Host 定时器，浏览器可关闭。
  手动长按保护只在日终已开启时通知 Host，保留这一步以避免自动上香抢先。
- 断线保留最后状态与在线偏好，使用有界重连退避；不靠公共快照解除身份故障。
  卸载清理 SSE、心跳、计时器、订阅与可取消请求。

## 未采用的优化

不延长默认轮询、不停掉隐藏标签页状态、不删除个人账本补读，也不缓存或节流显式打开。
这些做法会改变投票反馈、广播失效、跨端余额或恢复时效。
不引入跨标签主从选举、SharedWorker 或服务器长连接改造；当前收益不足以抵消生命周期、
DSH 兼容和故障接管成本。服务器请求数量本轮不变。

## 验证入口

- `tests/host-sse.spec.ts`：真实 HTTP/SSE 双连接、60 次重复通知、全部变化即时送达、
  广播失效、低 revision 新 epoch、重连全帧、心跳和卸载清理。
- `tests/live-store.spec.ts`：旧帧拦截、Host 重启、无额外请求的状态更新、悬停 cadence、
  显式刷新、断线恢复、同 ID 重试和档案增量。
- `tests/snapshot-cadence.spec.ts`、`tests/host-backend.spec.ts`、
  `tests/backend-broadcast.spec.ts`、`tests/day-end.spec.ts`：唯一计时器、实际后端一致性、
  广播到期及手动/日终串行与幂等边界。

定向验证：`pnpm exec vitest run tests/host-sse.spec.ts tests/host-routes.spec.ts tests/live-store.spec.ts tests/snapshot-cadence.spec.ts tests/backend-broadcast.spec.ts tests/day-end.spec.ts`，
另运行 `tests/host-backend.spec.ts` 与类型、lint 检查；全量发布前验证由统一候选门禁覆盖。
