# ClearRun 出海版

**Clear the creative. Clear the calendar.**

给出海的 AI/Agent 产品做上线前体检，分两步：
- **宣·素材预检**：先选定韩国、新加坡或美国，再检查某份素材能否在当地使用。对命中的规则，展示素材证据、风险原因、改法与关联案例。换稿后可在同一市场复检。
- **发·上线档期**：给每个市场找一个不撞档、不踩敏感日的发布周，并给出多市场错峰节奏。

本项目 fork 自 [ClearRun](https://github.com/zicheng-yu/clearrun)（电影和游戏的发布档期 agent），复用了它的撞档压力引擎和 Cloudflare 工程骨架，并去掉了 Qloo 依赖。

## 核心设计：模型只看，知识库来判

```
素材 ──► 感知模型（多模态） ──► 信号（gesture.pinch、claim.absolute_accuracy……）
                                        │
         knowledge/rules.yaml ◄─────────┤  判定：命中哪条规则、多严重、怎么改、哪些真实案例
         knowledge/calendar.yaml ◄──────┘  档期：素材带着这些信号时，哪些周会被拦截
```

- 模型只能输出 [`src/shared/signals.ts`](src/shared/signals.ts) 词表里的信号，并被明确要求**不做判断**。
- 是否有风险、风险多高，只由知识库规则决定（[`src/engine/creative/assess.ts`](src/engine/creative/assess.ts)）。所以每条结论都能追溯到规则和案例，模型没法凭空编造禁忌。
- 档期引擎（[`src/engine/launch/plan.ts`](src/engine/launch/plan.ts)）是纯函数，浏览器和 Worker 共用，调整参数时即时重算。

## 运行

需要 Node.js 22.18 或更高版本。

```sh
npm ci
npm run dev:mock      # 离线演示：三个示例案例走预置检测结果，不需要任何 key
npm test && npm run typecheck
```

Live 模式（用多模态模型检查你自己的素材）：

```sh
cp .dev.vars.example .dev.vars   # 填 OPENROUTER_API_KEY
npm run dev
```

模型 ID 在 [`cloudflare.config.ts`](cloudflare.config.ts) 的 `VISION_MODEL` 里配置，上线前到 openrouter.ai 确认一下。每次调用前都会检查 D1 里的花费台账（日上限 $1、总上限 $10）。

**部署前注意**：
- Worker 名已改为 `clearrun-global`，不会覆盖原 ClearRun。
- live 模式的 D1 ID 是占位值，要先建一个 D1 数据库，再把 ID 填进去。

## 知识库

| 文件 | 内容 |
|---|---|
| [`knowledge/cases.yaml`](knowledge/cases.yaml) | 真实案例，带原始报道链接和核实状态 |
| [`knowledge/rules.yaml`](knowledge/rules.yaml) | 规则：信号 → 原因 → 改法 → 案例 |
| [`knowledge/calendar.yaml`](knowledge/calendar.yaml) | 三个市场的宣发日历：假期、撞档事件、敏感期、顺势窗口 |

改完 YAML 后运行：

```sh
npm run knowledge        # 校验并重新生成 src/shared/knowledge.gen.ts
```

校验会检查 ID 是否唯一、引用是否存在、信号是否在词表里、日期格式和数值范围。CI 和 `npm run build` 都会检查生成文件是否和 YAML 同步。`verified: false` 的条目在界面上显示"待核实"。

## 示例案例与素材

三个主打案例定义在 [`src/shared/demo.ts`](src/shared/demo.ts)，每个都有"原版"和"本地化版"：

| 案例 | 雷点 | 关联真实案例 |
|---|---|---|
| 🇰🇷 同一张 KV，韩国要单独出一版 | 捏手势、隐私政策没有韩文版、没写数据存储地 | iPhone Air 韩国版、GS25、冒险岛、DeepSeek 被 PIPC 暂停下载 |
| 🇺🇸 美国发布文案 | "取代人类"、"100% 准确"、AI 代写情感内容、AI 生成的推荐语 | Apple Crush、Gemini Dear Sydney、Artisan、FTC Operation AI Comply |
| 🇸🇬 新加坡视频关键帧 | 一人分饰三族、刻意加深肤色、肉骨茶 | NETS E-Pay brownface |

`public/demo/` 存放演示素材。主视觉使用 AI 生成的全球版与韩国本地化版，另外两个案例使用 SVG 示意图。替换素材时：
- 文件名保持不变；
- 如果画面构图变了，同步更新 `demo.ts` 里对应信号的 `box`（框的位置，用占图片宽高的比例表示）。

用 live 模型跑一遍新素材，可以拿到真实的检测结果作为对照。

## 目录

```
knowledge/              知识库 YAML（唯一数据源）
scripts/                知识库校验与生成
src/shared/             词表、知识库类型、示例案例、日期工具、API 类型
src/engine/creative/    宣：信号 → 规则判定
src/engine/launch/      发：撞档压力日历、推荐周、错峰节奏
src/worker/             API：/api/scan、/api/launch、/api/knowledge、/api/health
src/client/             素材预检与发布排期工作台
test/                   知识库、判定、档期与感知层单元测试
poster/                 路演 A3 海报源码与渲染输出（HTML / PNG / PDF）
research/               调研与方案文档
```

## License

[MIT](LICENSE)
