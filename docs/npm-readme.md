# 梁相

**众香成势，梁子显相。梁相还得梁人出！**

这是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的插件包。本页右侧的 `npm i dsh-liangxiang` 不会把插件装进 DSH。

[官网](https://liang.today/) · [安装指南](https://liang.today/guide/) · [源码](https://github.com/liang-today/dsh-liangxiang)

## Desktop（推荐）

打开 **插件 → 发现**，搜索 **梁相** 或 `dsh-liangxiang`，点击安装。首次启用市场、添加可信目录及更新方法见[Desktop 指南](https://liang.today/guide/#desktop)。无需另装旧市场插件，不要用普通 npm CLI 修改 Desktop 独占的 Profile。

## Cmd

退出对应 WebUI，再安装并启动：

```bash
npx --yes @deepseek-ai/dsh plugin --profile web add dsh-liangxiang
npx --yes @deepseek-ai/dsh web
```

已有全局 `dsh` 时可替换开头；`web` 换成实际 Profile。升级使用插件安装命令；卸载使用 `plugin --profile web remove dsh-liangxiang`。香火账本不随卸载删除。

## 玩法与连接

每天一道梁案，新香客备 10 炷；对话继续攒香。Input + Output Token 按固定倍率折算：Pro ×1，Flash 与其他模型 ×0.5，默认 50,000 Pro 当量一炷。点一下一炷夯或拉，长按 1.5 秒倾炉；众香汇成梁位，日终收入梁祠。

在线模式一直不可用时，可能无法连接社区服务器；部分地区（如福建）可尝试让 DSH 使用代理，再重试。浏览器代理未必覆盖 DSH Host；也可手动选择独立记账的离线模式。

独立社区项目，非 DeepSeek 官方产品。梁位不代表实名人数、真实民意或任何个人、机构立场。
