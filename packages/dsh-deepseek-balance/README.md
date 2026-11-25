# DeepSeek 余额（DSH 插件）

在 DSH Web UI 左侧栏底部、「LiteLLM 用量」卡片**上面**放一张 DeepSeek 官方 API Key 的余额卡片。

## 界面

- **卡片**（`sidebar.footer.action`，`order: 10`，LiteLLM 卡片是 `20`，所以排在它上面）：
  - 左上：`DeepSeek 余额`
  - 右上：**剩余百分比** = 当前余额 ÷ 基准余额，两位小数（需要你先配置 `baseline`，未配置时只显示金额）
  - 下方右对齐：`¥8,181.44 / ¥8,313.60`（当前余额 / 基准余额，带千分位）
  - 最下方：剩余进度条（剩余 ≤30% 转警告色，≤10% 转错误色）
- **悬浮浮层**（鼠标悬浮或键盘聚焦时出现）：
  - 标题行：`DeepSeek 余额` + 右侧百分比 + `↻` 刷新
  - 明细：基准余额 / 当前余额 / 已消耗 / 充值余额 / 赠金余额（为正才显示）
  - 底部：左侧币种（余额不可用时带 ⚠︎），右侧 `更新于 HH:mm`
- 出错时卡片显示 `余额不可用`，浮层里给出具体原因（无凭据 / 401 / 超时 / 网络）。

## 百分比口径

`当前余额 ÷ baseline`，`baseline` 在 `cordis.patch.yml` 里配置；不配置则隐藏百分比。
只有 **余额币种与 `baselineCurrency` 一致**时才显示百分比；不一致时百分位显示 `—`，浮层提示币种不一致，
避免把 USD 余额除以 CNY 基准。

## 数据来源

Host 半用**你已经配置给官方 provider 的那把 Key** 请求 `GET https://api.deepseek.com/user/balance`
（`Authorization: Bearer <key>`），只把汇总数字发给浏览器，**Key 不会进入前端**。
接口返回 `is_available` 与 `balance_infos[]`（`currency` / `total_balance` / `granted_balance` / `topped_up_balance`）。

与「账号与余额」页的区别：那一页读的是**登录账号**的 Platform 钱包；这张卡片读的是**这把 Key** 所属账号的余额。
两者不是同一个账号时，数字本来就该不同——这正是这张卡片存在的意义。

## 刷新节奏

| 场景 | 行为 |
|---|---|
| 自动刷新 | 前端每 **60 秒**拉一次 `/deepseek-balance` |
| 鼠标悬浮 | 距上次读取超过 **5 秒**立即回源（`?fresh=1`） |
| Host 缓存 | 成功结果缓存 **30 秒**；自动刷新基本总是回源 |
| 手动刷新 | `↻` 带 `?fresh=1` 跳过缓存，图标按请求生命周期转圈 |
| 首屏 | 通道未就绪时按 2.5 秒重试 5 次 |

## 配置（`cordis.patch.yml` 里的 `deepseek-balance` 行）

| 字段 | 默认值 | 说明 |
|---|---|---|
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | 凭据名：先查 `ctx.credentials`，再查同名环境变量 |
| `baseUrl` | `https://api.deepseek.com` | 官方 API 根地址（不带 `/v1`） |
| `path` | `/deepseek-balance` | Host 提供给前端的只读 JSON 路由 |
| `cacheSeconds` | `30` | 成功结果的缓存秒数 |
| `baseline` | 未设置 | 百分比基准余额；留空/设 `null` 则只显示金额 |
| `baselineCurrency` | `CNY` | 基准余额币种，同时用于挑选 `balance_infos` 条目 |

## 文件

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半：读 Key、请求 `/user/balance`、缓存，注册 `GET /deepseek-balance` |
| `client.js` | Client 半：卡片 + 悬浮浮层，注册到 `sidebar.footer.action` |
| `cordis.patch.yml` | Bundle 补丁，插入 `deepseek-balance` 行 |
| `locale/zh.json`、`locale/en.json` | 插件管理页显示的标题与描述 |
| `icon.svg` | 插件图标（钱包 + ¥） |

## 局限

- 官方只提供**账户级余额**，没有「额度上限」，也没有按 Key / 按天的明细；明细要去
  `platform.deepseek.com` 的「用量信息」看。
- 余额是 Key 所属账号的总钱包，同账号下其它 Key、其它客户端的消耗都会一起扣，这张卡片分不出是谁花的。
- `baseline` 是固定的参考点，充值后如果想让百分比回到 100%，改 `cordis.patch.yml` 里的 `baseline` 再刷新页面。
