# Mock 演示构建产物

这是 `cf build --mode mock` 的 Build Output。**没有上传，没有绑定域名，没有写入 D1，也没有执行 deploy。**

## 这一份对应的源码

| 项 | 值 |
|---|---|
| main 合并提交 | `0c8e753b70a774e7627c0c25b6777dfccb55a10d` |
| 与该合并提交相同的树 | `454e713c7ff110fa01c9de8254b009a469bfe459` |
| 构建 | `npm run build:mock` |
| 文件清单 | `manifest.sha256`（`output/` 内 17 个文件的 SHA-256） |
| 界面截图 | `ui/`，离线演示，不会上传 |

这不是更早的 PR1 归档。协调侧若要发布，用这一份，并先核对下面的 Worker、D1 和域名。

目录里没有 API token，也没有 `OPENROUTER_API_KEY`。Worker 源码仍会在 live 模式下读取这个绑定名；mock 配置没有声明该 secret。

## 目标（只属于这次演示）

| 项 | 值 |
|---|---|
| 账号 | `8bd3c442c3f8ce8003575fc10f2cb079` |
| Zone（zichengyu.com） | `4d5cd4ce4448701dfa3de49e4ef55601` |
| Worker | `clearrun-global` |
| 演示域名 | `global-clearrun.zichengyu.com` |
| D1 | `clearrun-global-demo` / `1537b307-566a-40fc-8bf9-04ae80dac074` |
| `SCAN_MODE` | `mock` |

不要部署到 Worker `clearrun`，不要碰 `clearrun.zichengyu.com`，不要复用原站的数据库、密钥或 cron。域名不是 `clearrun-global.zichengyu.com`。

不带 `--mode mock` 的构建是 live：D1 仍是占位 id `00000000-0000-4000-8000-00000000c1a0`，会声明 secret，**不会**带上演示域名。不要把 mock 设成默认。

## 产物

- `output/`：`cf` 的 Build Output Specification（`v0/config.json`、`v0/workers/default/bundle/index.js`、静态 `assets/`、`worker.config.json`）
- `manifest.sha256`：上述文件的 SHA-256
- `../../migrations/0001_llm_spend.sql`：演示库的账本表。Worker 启动时也会自己建这张表。不要对原站数据库执行。

`worker.config.json` 里的 `domains` 只是声明。真正创建 DNS 发生在不带 `--dry-run` 的 deploy。

`ui/` 是 mock 界面截图，标明离线演示，只给核对和海报取材。这些图片不会上传到 Cloudflare。

## 以后若要发布

在已经登录的本机上执行，不要把 OAuth token 贴进命令行：

```sh
npm run build:mock
cf deploy --mode mock --dry-run --provision false
```

确认 dry-run 的 Worker 名、D1 名和域名无误之后，才可以去掉 `--dry-run`。`--provision false` 避免 CLI 新建别的数据库。

若要直接上传这份快照，而不是重新构建：

```sh
rm -rf .cloudflare/output
cp -a deploy/mock/output .cloudflare/output
cf deploy --prebuilt --provision false
```

`--prebuilt` 会上传当前 `.cloudflare/output`。上传前再看一眼 `worker.config.json` 的 `domains` 和 `DB`。这次任务没有执行不带 `--dry-run` 的 deploy。
