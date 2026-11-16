# 出海文化预检助手 · 调研报告

> 赛道：AI + 出海 ｜ 调研日期：2026-11-11 ｜ 工作代号：**Culture Preflight（出海预检）**
> v2：根据"不一定用 Qloo、可以自己做类似功能"的方向更新。主线改为**自建文化口味层**，Qloo 作为可选插件。

---

## 0. 结论速览

1. **Qloo 的本质**是一个口味知识图谱：告诉你"在某地、某类人里，什么更受欢迎，和什么口味相近"（affinity 0–1）。它**没有文化禁忌数据**，而且 key 需要商务申请。它自家的 hackathon（2026-09-30 至 10-30）已经结束，那批 key 赛后停用。
2. **类似能力可以用公开数据自己搭**，而且黑客松周期内做得出来。我实测了几个数据源，**都能直接按国家拉数据**：
   - Apple 各国音乐、App 榜单（免 key）
   - Netflix 各国每周 Top 10（覆盖 94 个国家，一个 TSV 文件）
   - Wikimedia 各国热门词条（按国家统计）
   - **Wikipedia 点击流**（印尼语、阿拉伯语、泰语、越南语、马来语、印地语、土耳其语等约 40 种语言）：可以当"喜欢 A 的人也看 B"的共现信号用
   - OpenStreetMap、Overture、Foursquare 开放 POI：各城市的品牌门店和菜系密度
3. 自建方案的**卖点**：每个结论都能追溯到公开数据，不依赖单一供应商。**短板**：没有个人级的跨品类行为数据，年龄、性别细分弱。这些短板要在报告里如实标注置信度。
4. 产品依然是两条腿：**避雷**（多模态 LLM + 带出处的禁忌知识库）+ **投其所好**（自建的文化口味层）。你说的 "have a clear run"，我理解成**上线前彩排**：用口味层生成有真实偏好的本地虚拟受众，先让他们"看一遍"广告。
5. 架构上把口味层做成统一接口（`market_taste / similar_in_market / local_index …`）。如果之后拿到 Qloo key，可以作为另一个数据源插进来，不影响上层。

---

## 1. 自建"文化口味层"（推荐主线）

### 1.1 要复刻 Qloo 的哪几种能力

| Qloo 能力 | 含义 | 自建替代 | 还原度 |
|---|---|---|---|
| 地域热度（`signal.location`） | 这个城市/国家流行什么 | 各国榜单 + 维基各国热门 + POI 密度 | 高（国家级）；城市级只有 POI 能做到 |
| 实体相似（`signal.interests.entities`） | 喜欢 A 的人还喜欢什么 | 维基点击流共现 + Last.fm 相似艺人 + TMDB 推荐 + 文本 embedding | 中 |
| 跨品类（品牌 ↔ 艺人 ↔ 影视） | 不同品类之间的口味关联 | 维基点击流天然跨品类（词条之间互相跳转）+ 统一 embedding 空间 | 中低 |
| 口味标签（`urn:tag`） | 一组口味用什么关键词描述 | 词条分类 + TMDB keywords + Last.fm tags + LLM 归纳 | 中 |
| 人口细分（年龄/性别） | 不同人群的偏好差异 | 公开数据基本没有，只能用 LLM 先验并标注为"估计" | 低 |
| 趋势（`/v2/trending`） | 热度上升还是下降 | 维基 pageviews 时间序列 + 榜单在榜周数 | 高 |
| 可解释性（`explainability`） | 结论从哪来 | 天然具备：每个分数都附带数据来源 | 高 |

### 1.2 数据源清单（✅ = 本次实测可用）

**A. 市场热度：这里流行什么**

| 数据源 | 粒度 | 获取方式 | 备注 |
|---|---|---|---|
| ✅ Apple 榜单 RSS | 国家 × 音乐/App/图书等 | `rss.marketingtools.apple.com/api/v2/{cc}/music/most-played/50/songs.json`，免 key | 实测印尼、沙特可用 |
| ✅ Netflix Top 10 | 94 国 × 每周 × 电影/剧集 | `netflix.com/tudum/top10/data/all-weeks-countries.tsv`（约 33MB） | 实测印尼本周榜首是本土恐怖片 |
| ✅ Wikimedia 各国热门 | 国家 × 天 × 全语言词条 | `wikimedia.org/api/rest_v1/metrics/pageviews/top-per-country/{CC}/all-access/{y}/{m}/{d}` | 反映"这个国家此刻在关注什么" |
| ✅ Wikimedia 单词条 pageviews | 语言版 × 天 | REST API | 用来做趋势和本地指数 |
| YouTube Data API | 国家 × 热门视频 | `videos.list?chart=mostPopular&regionCode=ID`，需要免费 key，每天 1 万配额 | 本地网红和内容风格 |
| Last.fm API | 国家 × 热门艺人/歌曲，艺人相似度、标签 | `geo.getTopArtists?country=…`、`artist.getSimilar`，免费 key | 音乐口味图谱的现成替代 |
| TMDB API | 地区 × 热门/上映/流媒体平台 | 免费 key，用 `region`、`watch_region` 参数 | 影视元数据和推荐关系 |
| ~~Spotify Web API~~ | — | 2024-11 起对新应用关闭了 related artists、recommendations 等端点 | 不建议依赖 |
| ~~Google Trends~~ | — | 没有稳定的公开 API，非官方库容易被封 | 可选，不进主链路 |

**B. 关联信号：喜欢 A 的人也喜欢 B**

| 数据源 | 说明 |
|---|---|
| ✅ **Wikipedia 点击流**（月度，约 40 种语言） | 统计"从词条 A 跳到词条 B"的次数（≥10 次才收录）。印尼语每月约 6.5MB，阿拉伯语约 10MB，泰语约 4MB，越南语约 4.5MB，很轻。**相当于免费的、跨品类的、分语言社区的兴趣共现图。** |
| Last.fm 相似艺人和标签 | 基于收听行为，是音乐领域的成熟共现数据 |
| TMDB 推荐和关键词 | 影视之间的推荐关系 |
| 榜单共现 | 同一国家同一周同时上榜的条目 |
| 文本 embedding | 对实体描述做 embedding，作为基于内容的相似度（对应 Qloo 的 `bias.content_based`） |

**C. 线下与品牌**

| 数据源 | 说明 |
|---|---|
| ✅ OpenStreetMap（Overpass API） | 城市内带 `brand` 标签的 POI。实测雅加达咖啡和快餐：Starbucks 80、KFC 53、McDonald's 49、Kopi Kenangan 16、Chatime 12、Janji Jiwa 9……**标注不全**，比如蜜雪冰城没有出现在结果里（可能被标成冰淇淋店，也可能漏标） |
| ✅ Overture Maps Places / Foursquare OS Places | 开放的全球 POI 数据集，覆盖比 OSM 全，适合补全 |
| Wikidata | **实体骨架**：统一 ID（QID）、多语言名称、品牌原产国、所属行业、母公司 |

**D. 宏观文化与日历**

| 数据源 | 用途 |
|---|---|
| Hofstede 六维度国家得分 | 决定文案风格。例如集体主义社会多讲"家人朋友"；不确定性规避高的社会更看重认证和背书 |
| World Values Survey | 价值观地图，非商业用途免费 |
| Nager.Date | 免费公共假日 API，用来检查上线时间是否撞节日 |
| 伊斯兰历重要节期 | 手工维护，比如斋月、开斋节 |

### 1.3 实测样例：印尼

- **Wikipedia 点击流（印尼语，2026-10）**：
  - Kopi Kenangan → **Kopi susu gula aren**（棕榈糖牛奶咖啡）16 次。这正是当地爆款口味，可以直接作为产品本地化线索。
  - Kopi Kenangan → **Kopi Janji Jiwa** 12 次，说明两者在用户心智里是本地直接竞品。
  - McDonald's → **Mixue Ice Cream & Tea** 20 次，蜜雪冰城和国际快餐被放在同一个心智框架里。
  - 从搜索进入的流量：Kopi Kenangan 2258 次，远高于 Starbucks 的 557 次。**本地品牌在本地语言社区的关注度更高**，这就是一个"本地指数"信号。
- **Netflix 印尼周榜（2026-11-08）**：电影榜前三都是本土片（*Haunting of Mount Welirang*、*Warkop DKI*、*Jangan Buang Ibu*），说明本土恐怖、喜剧、家庭题材的影响力很强。
- **Apple 印尼音乐榜**：可以直接看到当前流行的本地和国际艺人。

> 这些例子说明，用公开数据已经能产出"有证据的本地洞察"，可以直接放进 Demo。

### 1.4 评分设计（可解释）

- **本地指数（Local Index，类似 Qloo 的 index）**
  `LI(e, m) = 实体 e 在市场 m 的关注份额 ÷ e 在全球的关注份额`
  关注份额可以用该语言版维基 pageviews、各国榜单出现次数、POI 门店数等。LI > 1 表示"在这里比在全球更火"。
- **市场内相似度（Affinity，0–1）**
  `Aff(a, b | m) = w1·PMI_点击流(m) + w2·榜单共现(m) + w3·Last.fm/TMDB 相似 + w4·embedding 余弦`，最后归一化到 0–1。
  **每个分量都保留来源**，前端可以展示"这个分数来自哪里"，相当于 Qloo 的 explainability。
- **置信度**：按数据量和来源数量打 高/中/低 标签。年龄、性别等估计项一律标"估计"。

### 1.5 给 Agent 用的工具接口

```text
market_taste(market, category, top_k)      → 该市场某品类的热门实体 + 本地指数
similar_in_market(entity, market, category) → 在该市场与 entity 口味相近的实体 + 证据
local_index(entity, market)                 → 本地指数 + 趋势曲线
taste_tags(entities, market)                → 口味标签画像
cultural_profile(market)                    → Hofstede 维度 + 宗教/语言/节日概况
calendar_check(market, date_range)          → 节日、斋月、敏感日期
```

底层用一个 `TasteProvider` 接口。默认实现是 `OpenDataProvider`（公开数据），以后可以加 `QlooProvider`（需要 key），上层不用改。

### 1.6 黑客松里的工程量

- **只预计算 2–3 个目标市场**（比如印尼、沙特/阿联酋、加一个欧美市场作对照），4 个品类（音乐、影视、品牌/餐饮、App）。
- 数据管道：每个数据源写一个抓取脚本，统一落到 DuckDB 或 SQLite。实体通过 Wikidata QID 对齐，对不上的用名称模糊匹配加 LLM 消歧。
- 优先级：Netflix TSV、Apple RSS、维基各国热门和点击流、OSM/Overture（都免 key，最快）→ YouTube、Last.fm、TMDB（要申请免费 key）→ Hofstede、节假日。
- 估计 1 个人 1 天能把前 4 个数据源跑通，第 2 天做评分和接口。

---

## 2. Qloo 调研（可选数据源，备查）

### 2.1 能力概览
- 口味知识图谱，官方称覆盖 2.5 亿+ 实体，所有品类训练进同一个 embedding 空间，支持跨品类关联。
- 不需要 PII，也不需要自带数据。数据按日/周/月刷新。
- REST JSON，鉴权用请求头 `X-Api-Key`。

### 2.2 核心端点

| 端点 | 作用 |
|---|---|
| `GET /search` | 名字 → 实体 ID（包括城市 `urn:entity:locality`） |
| `GET /v2/tags` | 搜标签 ID，支持语义搜索（beta） |
| `GET /v2/insights` | 主端点。`filter.type` 可选 artist、book、brand、destination、movie、person、place、podcast、tv_show、video_game，以及 `urn:tag`、`urn:demographics`、`urn:heatmap` |
| `GET /v2/analysis/compare` | 对比两组实体的受众 |
| `GET /v2/trending` | 每周热度时间序列 |

关键参数：`signal.location(.query)`（适用于几乎所有类型）、`signal.interests.entities/tags`、`signal.demographics.age/gender`、`feature.explainability=true`。

### 2.3 坑
- 无效参数会被静默忽略，返回 200 + 空结果，不会报错。
- 标签和人群必须用合法 ID，不能填自由文本。
- `/v2/insights` 只接受 GET；`/v2/audiences` 已标 deprecated。
- **不能在公开仓库里存 Qloo 返回的数据**。
- 数据源偏欧美，东南亚和中东的覆盖需要实测。

### 2.4 接入方式与 Key
- Key 要联系 Qloo 申请。它自家 hackathon 的 key 只在 `hackathon.api.qloo.com` 有效，赛后停用。
- 有 MCP Server：`npm i -g @qloo/qloo-harness` → `claude mcp add qloo -- qloo mcp`，需要 key。
- 另有托管的 Documentation MCP，不需要 key。

---

## 3. 产品方案：Culture Preflight（出海预检）

### 3.1 定位
> 中国品牌出海前的"文化体检 + 本地彩排"：**避开会翻车的雷，找到会共鸣的点。**

**目标用户**：出海的新消费、茶饮、餐饮、跨境电商、游戏、短剧、App 的市场和品牌团队。

### 3.2 四个模块

```
          ┌────────────── 输入 ──────────────┐
          │ 品牌名 / Slogan / 海报·视频帧 / 落地页  │
          │ 目标市场 / 目标人群 / 上线日期           │
          │ 母国对标品牌                          │
          └───────────────┬────────────────┘
                          ▼
 ┌──────────────┬──────────────┬──────────────┬──────────────┐
 │ ① 口味画像    │ ② 避雷扫描    │ ③ 本地彩排    │ ④ 本地化改稿   │
 │ (文化口味层)  │ (LLM+知识库)  │ (口味层+LLM)  │ (LLM+口味层)  │
 └──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
        └──────────────┴──────┬───────┴──────────────┘
                              ▼
          《出海预检报告》 红/黄/绿风险 + 证据 + 改法 + 改稿前后对比

  文化口味层 = TasteProvider { OpenDataProvider（默认） | QlooProvider（可选） }
```

**① 市场口味画像**
- 目标市场的热门品牌、艺人、影视、App，以及口味标签和本地指数。
- 对标品牌在当地的"心智邻居"，例如 Kopi Kenangan 的邻居是 Janji Jiwa 和棕榈糖咖啡。
- 每条结论附带数据来源和置信度。

**② 避雷扫描**
- 文本：品牌名、Slogan 在目标语言里的含义、谐音、俚语；敏感词；违禁宣称。
- 图像（多模态 LLM）：颜色、手势、动物、宗教符号、**地图与边界**、暴露程度、酒精/猪肉、数字。
- 时间：是否撞斋月、国丧、宗教节日。
- 合规：清真认证、酒精广告、比较广告、儿童广告等。
- **每条风险都要引用知识库条目，不能让 LLM 自由发挥。**

**③ 本地彩排（"have a clear run"）**
- 生成 5–8 个本地虚拟受众。每人的偏好来自口味层的真实数据（本地热门艺人、在追的剧、常去的品牌），不是 LLM 凭空想象。
- 由 LLM 扮演这些受众，给出第一反应、模拟评论区发言、哪里看着别扭、怎么改会更喜欢。

**④ 本地化改稿 + 复检**
- 结合①找到的共鸣点和②发现的风险，改写 Slogan 和视觉 brief，并给出联名/KOL 建议。
- 自动复检，展示风险分和共鸣分的前后对比。

### 3.3 禁忌知识库（种子维度）

| 维度 | 典型条目（示例） | 检测 |
|---|---|---|
| 颜色 | 白色在东亚/南亚部分场景关联丧葬；紫色在巴西、泰国关联哀悼 | 视觉 + 规则 |
| 数字 | 4（中日韩）、13（欧美）、17（意大利） | 文本/视觉 + 规则 |
| 手势/身体 | 竖大拇指在伊朗、伊拉克、西非部分地区不雅；OK 手势在巴西、土耳其冒犯；阿拉伯世界忌讳鞋底朝人；中东、南亚忌左手递物 | 视觉 |
| 动物/食物 | 穆斯林市场的猪和酒精；印度的牛肉；部分伊斯兰语境对狗的看法 | 视觉 + 文本 |
| 宗教符号 | 佛像作装饰/纹身（泰国、斯里兰卡敏感）；阿拉伯文经文或类似字形出现在鞋、地毯等商品上；印度教神像用于鞋服 | 视觉 + 案例 |
| 地图/领土 | 越南、菲律宾对"九段线"高度敏感；印度对克什米尔等边界表述有严格要求 | 视觉 + 规则 |
| 王室/政治 | 泰国冒犯君主罪；各国政治人物和敏感事件 | 文本 + 视觉 |
| 语言/命名 | 品牌名在当地语言里是俚语或脏话（三菱 Pajero 在西语市场改名 Montero；本田 Fitta 在北欧改名 Jazz） | 多语言词义检查 |
| 时间 | 斋月白天的饮食广告；宗教节日；国家哀悼日 | 日历 API + 规则 |
| 法规 | 印尼《清真产品保障法》（33/2014）的清真认证要求；法国 Loi Évin 限制酒类广告；各地对性别/LGBTQ 内容的法律要求方向不同（有的限制，有的期待包容） | 规则 + 出处 |

> 网上流传的很多"禁忌段子"是假的，比如"雪佛兰 Nova 在西语里是 no va，所以卖不出去"，已被辟谣。**知识库每条都必须有可信出处**。这一点可以写进路演。

**案例库种子**（细节以原始报道为准）：
- SHEIN（2020）：把伊斯兰祈祷毯当作装饰地毯售卖，下架并道歉。
- Nike Air Max 270（2019）：鞋底 logo 被指像阿拉伯文"真主"。
- Dolce & Gabbana（2018）：中国"筷子"广告引发抵制，上海大秀取消。
- 越南禁映《雪人奇缘》（2019）和《芭比》（2023）：片中地图含"九段线"。
- 蜜雪冰城印尼（2022–2023）：因清真认证引发舆论，之后取得认证。

### 3.4 技术栈建议
- **前端**：Next.js。
- **Agent 层**：Claude，多模态看图，用 tool use 调用口味层接口和知识库。
- **数据层**：Python 抓取脚本 → DuckDB/SQLite；Wikidata QID 对齐实体；向量库存 embedding（Demo 规模用 sqlite-vec 或内存索引就够）。
- **知识库**：YAML 规则库，每个市场 50–100 条，每条带 `source_url`。
- **日历**：Nager.Date + 手工维护的伊斯兰历节期。

### 3.5 Demo 剧本（3 分钟）
> 虚构品牌"××茶"准备进入**雅加达**。

1. 上传一张"国内爆款"海报：猪年元素、红白配色、直译的 Slogan，再配一张东南亚门店地图。
2. **避雷**：红色警告是猪元素、地图边界表述、缺清真标识；黄色警告是 Slogan 直译后的歧义。每条都带出处。
3. **口味画像**：本地指数显示 Kopi Kenangan、Janji Jiwa 等本地品牌比国际品牌更受关注；点击流揭示"棕榈糖咖啡"口味线索；Netflix 和 Apple 榜单给出当前流行的本土内容和艺人。
4. **彩排**：6 个数据驱动的本地虚拟受众"看"海报，弹出评论区模拟。
5. **改稿复检**：生成本地化版本（比如推出棕榈糖口味、本土 IP 联名、清真标识），风险分从 38 升到 86。

---

## 4. 竞品与差异化

| 类型 | 代表 | 短板 |
|---|---|---|
| 品牌命名语言筛查机构 | Labbrand、Lexicon 等 | 人工，贵，周期以周计 |
| 广告预测试 | Kantar LINK AI、System1、Zappi | 测广告效果和情感，跨文化禁忌不是重点 |
| 合成受众 | Synthetic Users、Aaru、Simile 等 | 通用模拟，没有本地口味数据支撑 |
| 本地化平台 | Smartling、Lokalise、Phrase | 以翻译为主 |
| 口味数据 API | Qloo | 商业授权；不含禁忌；不面向出海工作流 |
| 直接问大模型 | — | 没有出处、结果不稳定；不知道当地人此刻真正喜欢什么 |

**差异化**：避雷（有出处）+ 投其所好（公开数据驱动的口味层，可溯源）+ 彩排（数据驱动的虚拟受众），面向中国出海团队。

---

## 5. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 公开数据缺年龄/性别细分 | 中 | 如实标注为"估计"；彩排里只用市场级口味，不假装精确到人口细分 |
| 长尾本地品牌缺数据 | 中 | Overture/Foursquare POI 补全；回退到品类和标签层面 |
| 实体对齐出错（同名、多语言） | 中 | 以 Wikidata QID 为主键，名称模糊匹配 + LLM 消歧，并保留人工修正表 |
| LLM 编造禁忌 | 高 | 禁忌结论只能引用知识库；没覆盖到的标"待人工复核" |
| 虚拟受众带刻板印象 | 中 | 画像只由口味数据构成，不按种族或宗教硬编码；加免责声明 |
| 数据源条款 | 中 | 优先用开放许可数据（维基 CC、OSM ODbL、Overture、Foursquare OS Places）；按要求署名；榜单类数据只做聚合展示 |

---

## 6. MVP 范围

**必做**：
- 2 个市场的口味层预计算（Netflix + Apple + 维基各国热门/点击流 + OSM）。
- ② 避雷扫描（2 个市场的精选知识库）。
- ① 口味画像页（本地指数、心智邻居、证据）。
- 报告页（红黄绿、出处、改法）。

**加分**：
- ③ 本地彩排。
- ④ 一键改稿 + 前后对比。
- YouTube、Last.fm、TMDB 接入。
- 趋势曲线。

**暂不做**：视频逐帧分析、全球覆盖、商标库实时检索、年龄/性别精细画像。

---

## 7. 需要你确认的问题

1. 黑客松有多长时间？团队几个人，技术栈偏好是什么？
2. 目标垂类：新消费/茶饮（视觉禁忌多，Demo 直观）、游戏/短剧，还是跨境电商？
3. 首选目标市场：东南亚、中东、欧美？
4. 提交要求：要不要可公开访问的 Demo、开源仓库、路演 PPT？

---

## 来源

**实测数据接口（2026-11-11）**
- Apple 榜单 RSS：https://rss.marketingtools.apple.com/
- Netflix Top 10：https://www.netflix.com/tudum/top10 ｜ 数据文件 https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv
- Wikimedia Pageviews API：https://wikimedia.org/api/rest_v1/ （`top-per-country` 端点）
- Wikipedia Clickstream：https://dumps.wikimedia.org/other/clickstream/
- OpenStreetMap Overpass API：https://overpass-api.de/
- Overture Maps Places：https://docs.overturemaps.org/guides/places/
- Foursquare OS Places：https://huggingface.co/datasets/foursquare/fsq-os-places
- Last.fm API：https://www.last.fm/api/show/geo.getTopArtists

**Qloo**
- 文档：https://docs.qloo.com/docs/solutions-overview ｜ Insights：https://docs.qloo.com/reference/insights-api-deep-dive
- 参数：https://docs.qloo.com/reference/parameters ｜ 各类型参数：https://docs.qloo.com/reference/available-parameters-by-entity-type
- MCP：https://docs.qloo.com/reference/qloo-mcp ｜ FAQ：https://docs.qloo.com/docs/faqs
- Hackathon 开发者指南：https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
- Qloo Agentic Hackathon（已结束）：https://qloo.devpost.com/

**未逐条核实**：YouTube、TMDB、Spotify 的接口政策，Hofstede、WVS、Nager.Date 的使用条款，以及文化禁忌维度和案例，均依据公开资料和常识整理。本次网页搜索工具不可用，**写进知识库或路演前需要补充原始出处**。
