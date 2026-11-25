# LiteLLM 用量（DSH 插件）

在 DSH Web UI 的左侧栏底部放一张 LiteLLM 用量卡片，鼠标悬浮或用键盘聚焦时弹出详情浮层。

## 界面

- **卡片**（`sidebar.footer.action`）：独占侧栏底部一整行，位于 `Remote` 下方、账户行上方：
  - 左上：`剩余用量（11/16 00:00 重置）` —— 标签 + 括号内的重置时刻
  - 右上：剩余额度百分比，两位小数（剩余 / 周额度）
  - 下方右对齐：`已用 $x.xx / $300.00`
  - 最下方：剩余额度进度条（= 上面的百分比；剩余 ≤30% 转警告色，≤10% 转错误色）
- **悬浮浮层**（仅鼠标悬浮或键盘聚焦时出现，点击卡片不做任何事）：
  - 标题行：`LiteLLM 用量` + 右侧 `剩余百分比` + 最右 `↻` 刷新按钮
  - 进度条：与卡片同一口径（剩余额度占比）
  - 明细行：本周额度 / 已用 / 进行中（in-flight 预留）/（累计消费，与本周已用相同则不显示）
  - 底部：左下角 `重置 11/16 00:00`，右下角 `更新于 HH:mm`
  - 浮层宽度与卡片一致，绝对定位浮在卡片上方，不推挤侧栏其它元素；指针移出即收起。
    浮层底色与卡片一致（`--dsw-alias-bg-layer-1`）并加深边框，避免比卡片更亮。
- 「进行中」= LiteLLM 的 `reserved`：请求已受理但还没最终结算的在途金额，会先占用预算，结算后进入「已用」。
- 卡片独占一行的做法：运行时找到页脚那一行 flex 容器，把它改成网格（每项一行、列宽 `minmax(0,1fr)`），
  卸载时还原内联样式；不依赖任何宿主类名。
- 鼠标悬浮时卡片本身会变底色 + 加深边框，作为"可展开"的提示。
- 进度条口径统一：卡片与浮层都显示**剩余额度**占比（剩余 ≤30% 转警告色，≤10% 转错误色）。
- 文案跟随宿主语言（中文 / English）。

## 刷新节奏

| 场景 | 行为 |
|---|---|
| 自动刷新 | 前端每 **60 秒**拉一次 `/litellm-usage` |
| 鼠标悬浮 | 打开浮层时若距上次读取超过 **5 秒**，立即回源刷新一次（带 `?fresh=1`）；5 秒内的重复悬浮不重复请求 |
| Host 缓存 | 成功结果缓存 **20 秒**（`cacheSeconds`）；60 秒周期下自动刷新基本总是回源 |
| 手动刷新 | 点 `↻` 带 `?fresh=1`，**跳过缓存**直连 LiteLLM；图标按请求生命周期转圈（结束即停，最短 400ms） |
| 首屏 | 若宿主通道尚未就绪，按 **2.5 秒**间隔重试 **5 次** |
| 代理侧记账 | `/key/info` 实时返回；`进行中(reserved)` 在请求结算后并入 `已用(spent)` |

## 重置时间怎么来的

LiteLLM 的 `/key/info` 只在预算行带有 `budget_reset_at` 时才返回重置时刻，这个代理配的是普通 `1 week` 预算，**接口里没有该字段**（`/budget/info`、`/spend/logs`、`/user/daily/activity` 对非管理员 Key 均 403）。

所以 Host 侧按周预算的窗口规则推导：**下一个周一 00:00（固定 UTC+8）**。当前推导结果 `11/16 00:00`
与 LiteLLM 门户「我的接入 / 个人用量」里显示的 `11/16 00:00 重置` 一致，卡片上用括号显示为
`剩余用量（11/16 00:00 重置）`，弹窗里单独一行 `重置 11/16 00:00`。

- 时区固定 +8 小时，不跟随机器时区；需要改时可在 patch 里配 `resetUtcOffsetHours`（默认 8）。
- 若代理以后开始返回 `budget_reset_at`/`reset_at`，代码优先使用真实值（响应里 `resetDerived: false`）。

## 数据来源

Host 半读取 LiteLLM 代理的 `GET /key/info`（使用你已经在用的同一个虚拟 Key），只把汇总后的用量数字发给浏览器，**Key 不会进入前端**。

你的 LiteLLM 代理（例如 `https://litellm.example.com`）提供的用量接口：

| 接口 | 结果 |
|---|---|
| `GET /key/info` | ✅ 返回 `spend`、`max_budget`、`budgets[]`（period=week，含 limit/spent/remaining/reserved）、`key_alias` |
| `GET /user/info` | ✅ 返回 user 级同样字段 |
| `GET /user/daily/activity`、`GET /spend/logs` | ❌ 403（非管理员 Key），所以没有按天明细，只能展示周预算口径 |

**关于重置时间**：该代理的 `budgets[]` 里没有 `budget_reset_at`，接口不返回具体重置时刻，所以浮层显示重置节奏
（`重置 每周`）。如果哪天代理开始返回 `budget_reset_at`/`reset_at`，卡片会自动显示具体时间（`MM/DD HH:mm`），
无需改代码。

## 配置（`cordis.patch.yml` 里的 `litellm-usage` 行）

| 字段 | 默认值 | 说明 |
|---|---|---|
| `baseUrl` | ''（必填，填你自己的代理地址） | 代理根地址（不要带 `/v1`） |
| `apiKeyEnv` | `LITELLM_API_KEY` | 凭据名：先查 `ctx.credentials`，再查同名环境变量 |
| `apiKey` | 无 | 直接写死 Key（优先级最高，不建议） |
| `path` | `/litellm-usage` | Host 提供给前端的只读 JSON 路由 |
| `cacheSeconds` | `20` | 成功结果的缓存秒数 |
| `timeoutMs` | `10000` | 请求 LiteLLM 的超时 |

## 文件

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半：读取 Key、请求 `/key/info`、缓存，并注册 `GET /litellm-usage` |
| `client.js` | Client 半：卡片 + 悬浮浮层，注册到 `sidebar.footer.action` |
| `cordis.patch.yml` | Bundle 补丁，插入 `litellm-usage` 行 |
| `locale/zh.json`、`locale/en.json` | 插件管理页显示的标题与描述 |
| `icon.svg` | 插件图标（仪表盘） |
