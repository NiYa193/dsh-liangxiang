# 香港备服隔离演练

本流程验证未发布交易候选，不是公开发布。目标地址、SSH身份和端口只从本机忽略的配置或进程环境读取，不写入仓库。生产节点、备服原实例及原数据库不参与模拟交易。

## 固定隔离边界

| 资源 | 专用值 |
| --- | --- |
| 服务 | `liangxiang-backend-rehearsal` |
| 源码与版本收据 | `/opt/liangxiang-rehearsal`、其下 `VERSION` |
| 配置 | `/etc/liangxiang-rehearsal.env` |
| 数据库 | `/var/lib/liangxiang/rehearsal/liangxiang-rehearsal.sqlite` |
| 业务时钟 | 同目录 `clock.json` |
| 监听 | `127.0.0.1:4195`，不增加公网入口 |

只通过 `LIANGXIANG_DEPLOY_MODE=rehearsal bash scripts/deploy.sh` 部署，并以同模式运行 `scripts/deploy-check.sh`。只接受显式 standby 目标、预期主机名及干净的已提交源码；沿用原代理配置指纹检查。原实例、代理、SSH、系统时钟和防火墙均不修改。若同机维护或压测正在独占目标，等待其明确释放后才能部署。

## 业务时间与签名

独立入口 `lib/rehearsal-backend.js` 复用真实服务、HTTP和SQLite事务；普通 `lib/backend.js` 不加载演练模块。启动需要 `LIANGXIANG_REHEARSAL=1`，固定回环监听、专用数据库和时钟文件，并强制拒绝未签名请求。演练入口、独立 `lib/rehearsal-runner.js`、脚本和原始美术PNG不在npm文件白名单内。

时钟文件格式为 `{ "epoch_ms": 1794153600000, "anchor_wall_ms": 0, "rate": 0 }`：业务时刻为起点加真实经过时间乘倍率；`rate:0` 暂停，便于检查封盘与午夜两侧。首次部署写入起点，已有数据库或时钟绝不重置。控制文件只由运维/演练进程原子替换，没有HTTP改时接口。运行中拒绝时间倒退，重启沿用控制文件；不可将旧控制文件回灌已运行的数据库。

请求签名时效、改仓限流和网络超时仍用真实时钟。投票桶保留每分钟500炷规则，恢复时间与数据库投票时间同用演练业务时钟；此演练不验证真实时间下的额度压力。模拟Token资金由各身份签名申报；这仍是软信任合成数据，不证明真实DSH用量。

## 手动与自动通路

- 手动：真实独立DSH Profile安装当前tarball，经 `scripts/rehearsal-relay.mjs` 的回环监听和SSH标准输入/输出访问专用后台。它只允许连接远端固定回环4195，不开启SSH转发权限或公网代理。原本地演示Profile保留。
- 自动：在专用实例旁以服务账号运行独立 `lib/rehearsal-runner.js`（源码为 `scripts/rehearse-market.ts`），以至少12个独立签名安装身份走真实HTTP；密钥与续跑状态只放专用私有目录，报告只输出编号和汇总。
- 分阶段：prepare后可重启专用服务，finish再推进后两盘与午夜，verify核对已完成结果。只运行all不得宣称验证了进程重启。

报告分别记录部署收据、手动操作、自动负向场景、真实参考点与整炷派彩、冻结/可用守恒、重启/重试、SQLite完整性及原实例前后健康。未执行或仅在本地覆盖的项目须单独说明；小规模演练不能推导千用户容量。
