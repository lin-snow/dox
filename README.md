
https://github.com/lin-snow/dox , AGPL3.0

# dox 项目技术栈交接文档

## 项目概述

**dox** 是一个面向个人的自部署 todo 应用，提供独立 server + 多端客户端架构。Server 单实例自部署，首期客户端为 TUI（主）+ CLI（同二进制），未来扩展 Web 和桌面端。

**核心架构特征**：

- 单二进制 Go server + 单 SQLite 数据库，Docker 一行启动
- **Server 是唯一数据源（thin-client 架构）**：客户端不本地持久化、不缓存业务数据，所有操作直接打 server HTTP API
- 多客户端通过 protobuf 契约 + HTTP/JSON API 通信
- 一份业务核心代码 `@dox/core`，被所有客户端复用
- 一个 TS 二进制根据上下文（TTY 检测 + 子命令）切换 CLI/TUI 模式
- **明确不做离线 / local-first**：使用 dox 必须先部署 server 并保持连通

## 技术栈总览

### Server 端 (Go)

| 类别 | 选型 | 说明 |
|---|---|---|
| 语言 | Go（版本随当前 stable） | 与作者既有项目 Ech0 技术栈一致 |
| 契约定义 | Protocol Buffers + buf | proto 为 single source of truth |
| RPC 框架 | gRPC + grpc-gateway | 同时暴露 gRPC 和 HTTP/JSON 接口 |
| OpenAPI 文档 | [protoc-gen-openapi](https://github.com/google/gnostic/tree/main/cmd/protoc-gen-openapi) | 从 proto 生成 OpenAPI，便于 curl/调试/前端联调 |
| 数据库 | SQLite | 单文件，零运维 |
| DB Driver | `modernc.org/sqlite` | 纯 Go 实现，**零 CGO 依赖**，交叉编译友好 |
| Query 生成 | sqlc | 写 SQL → 生成类型安全 Go 函数，零运行时反射 |
| Migration | goose v3 + embed.FS | 启动时自动 Up，体验等同 GORM AutoMigrate |
| 日志 | 标准库 `log/slog` | 结构化日志 |
| 配置 | env 变量为主，YAML/TOML 可选 | 参考 Ech0 做法 |
| 认证 | Bearer token（env bootstrap + Pairing Code Flow 设备 token） | 不上 OAuth/JWT，详见架构决策 §5 |
| ID 生成 | ULID（server 端） | URL 友好、时间有序、不暴露记录总数 |
| 时间戳 | UTC int64 unix milliseconds | proto 字段直接 `int64`，不用 `google.protobuf.Timestamp` |

### Client 端 (TypeScript)

| 类别 | 选型 | 说明 |
|---|---|---|
| 运行时 | Bun | 启动快、内置 TS、内置打包 |
| 兼容性 | 代码保持 Node 可运行 | 不依赖 Bun-only API（如 `bun:sqlite`、`Bun.serve`），未来加 Node 分发零成本 |
| 语言 | TypeScript | strict 模式 |
| 包管理 | Bun workspaces | monorepo 管理 |
| TUI 框架 | **Ink** + React 18 | Claude Code 同款心智模型 |
| UI 组件库 | **@inkjs/ui** | Ink 官方组件库（Spinner, TextInput, Select, MultiSelect, ProgressBar, Alert, Badge 等） |
| 布局引擎 | yoga-layout（Ink 内置依赖，无需单独装） | flexbox 心智模型 |
| CLI 框架 | Commander.js | 参数解析、子命令路由 |
| CLI 交互 prompt | @clack/prompts | CLI 模式下的交互式输入 |
| 状态管理 | 待定（优先 Ink 内置 hooks，复杂度真上来再换 Zustand/Jotai） | 后续讨论 |
| 配置 / Token 存储 | `~/.config/dox/config.toml`（chmod 600） | 仅存 server URL + device token，**不存业务数据** |
| API Client | buf 生成的 grpc-gateway TS client | 类型安全，从 proto 生成 |
| 测试 | ink-testing-library + bun test | Ink 组件可单测 |
| CJK 字符宽度 | string-width | Ink 大部分场景内置处理，边界情况手动用此库 |

## 项目目录结构

```
dox/
├── proto/                              ← Protocol Buffers SoT
│   └── dox/v1/
│       ├── todo.proto
│       └── auth.proto                  ← Pairing Code Flow + device token
│
├── apps/
│   ├── server/                         ← Go server
│   │   ├── cmd/dox-server/main.go
│   │   ├── internal/
│   │   │   ├── db/
│   │   │   │   ├── migrate.go          ← goose embed 自动 Up
│   │   │   │   ├── migrations/         ← *.sql 文件（时间戳命名）
│   │   │   │   └── queries/            ← sqlc 生成产物
│   │   │   ├── service/                ← gRPC service 实现
│   │   │   ├── auth/                   ← bearer token 中间件 + 设备 token 验证
│   │   │   ├── pair/                   ← Pairing Code Flow 实现（in-memory pending codes）
│   │   │   └── config/
│   │   ├── gen/                        ← buf 生成的 Go 代码
│   │   ├── sqlc.yaml
│   │   └── Dockerfile
│   │
│   └── cli/                            ← TS 客户端（TUI + CLI 同壳）
│       └── src/
│           ├── index.ts                ← entry：TTY 直接进 TUI；带子命令/被 pipe → CLI
│           ├── cli/                    ← CLI 实现（Commander + clack）
│           └── tui/                    ← TUI 实现（Ink + @inkjs/ui）
│
├── packages/                           ← TS workspaces
│   ├── proto-gen/                      ← buf 生成的 TS 代码
│   └── core/                           ← 业务核心（UI-agnostic 铁律）
│       └── src/
│           ├── domain/                 ← 类型 + 验证（纯函数，跨平台）
│           ├── api/                    ← grpc-gateway TS client 封装 + 错误转译
│           ├── auth/                   ← Pairing 流程 client 侧 + token 持久化
│           ├── config/                 ← client 端配置加载
│           └── output/                 ← Human / JSON 输出抽象（CLI 用）
│
├── buf.yaml
├── buf.gen.yaml
├── package.json                        ← Bun workspaces 根
└── README.md
```

## 关键架构决策

### 1. proto 是唯一契约面

所有跨进程通信由 proto 定义，Go server 和 TS clients 都从同一份 proto 生成代码。修改 API 流程：

1. 改 `proto/dox/v1/*.proto`
2. `buf lint` + `buf breaking`（防止破坏性改动）
3. `buf generate` 生成 Go + TS 代码 + OpenAPI 文档
4. 两端实现 / 调用对应方法

### 2. 一个 TS 二进制，两种模式

入口逻辑（`apps/cli/src/index.ts`）：

```typescript
if (args.command === 'ui' || (!args.command && process.stdout.isTTY)) {
  await runTUI(args)        // 全屏 Ink 应用
} else {
  await runCLI(args)        // 一次性 CLI，执行完退出
}
```

- 人在终端直接 `dox` → 进 TUI
- `dox add "买菜"` / 被 pipe → 进 CLI
- `--json` flag 或非 TTY 自动切机器友好输出

### 3. `@dox/core` 是 UI-agnostic 铁律

`@dox/core` **绝不允许 import** Ink、React、Commander、clack 或任何 UI 库。它只暴露纯函数和业务对象。任何 UI（TUI/CLI/Web/Desktop）都是它的薄壳。

### 4. Thin-client：server 是唯一数据源

客户端不持久化任何业务数据，所有 todo 操作直接打 server HTTP API。这是一个**显式的简化决策**，放弃 local-first 换取：

- 没有同步引擎、outbox、tombstone、冲突解决
- 数据一致性自动保证（只有一份）
- proto / API 设计简化为标准 CRUD（无 `GetChanges(since=...)` 类 delta 协议）
- 客户端依赖瘦一圈（无 SQLite、无后台 sync worker）

**代价**：

- 离线完全不可用（server 挂了 / 断网就用不了）
- 每次操作有一次网络 RTT（LAN ~5ms，公网 50-200ms，自部署场景可接受）

**多端实时性**：多端同时打开 dox 时不强求毫秒级同步，方案是 TUI 提供手动刷新键（如 `r`）+ 后台轻量 poll（默认 30s，可配置）。**不上 WebSocket / SSE**——个人 todo 场景不值得长连接基建。

### 5. 认证：Pairing Code Flow

不上 OAuth / JWT / 账号密码。单用户自部署场景下，**"能 SSH 到 server 的人即 admin"是天然鉴权前提**，所有客户端 token 基于这个前提派生。

**v0.x（最简，先跑起来）**：

- Server env：`DOX_BOOTSTRAP_TOKEN=<32+ 字节随机串>`
- Client：`dox login --server <url>` 提示粘贴该 token
- 所有请求带 `Authorization: Bearer <token>`
- Server 中间件用 `subtle.ConstantTimeCompare` 验证

**v0.y（推荐，正式版本）**：Pairing Code Flow

```
[Server admin]
$ dox-server pair --name "my-laptop"
Pairing code: ABCD-EFGH  (60s 有效)

[Client]
$ dox login --server https://my.dox.com
> Pairing code: ABCD-EFGH
✓ Logged in as "my-laptop"
✓ Token saved to ~/.config/dox/config.toml (chmod 600)
```

要点：

- Server 维护 `device_tokens` 表（`id`, `name`, `token_hash`, `created_at`, `last_seen_at`）
- Pairing code 仅存 server 内存（60s TTL），消费即销毁
- 每设备一个 token，admin 可 `dox-server device list/revoke`
- HTTPS 必备（生产环境配 Caddy/nginx + Let's Encrypt）

未来若开放多用户，在 `device_tokens` 加 `user_id` 列即可，不需推翻 token 模型。

### 6. SQLite 关键 PRAGMA（必设）

Server 启动 SQLite 时设置：

```
journal_mode=WAL
synchronous=NORMAL
foreign_keys=ON
busy_timeout=5000
cache_size=-64000
temp_store=MEMORY
```

连接池建议：写操作 `SetMaxOpenConns(1)`（SQLite 写串行化），或拆读写两个 `*sql.DB`。

### 7. Migration 自动应用

Go server 用 `embed.FS` 嵌入 `migrations/*.sql`，启动时 `goose.Up()` 自动应用。用户视角与 GORM AutoMigrate 一致（docker run 自动到最新 schema），同时保留显式 SQL migration 的全部好处。

文件命名用**时间戳**（`20260516120000_init.sql`）而非序号，防协作冲突。

sqlc 的 `schema` 字段指向 migrations 目录，自动读取最终 schema 推断类型。

### 8. ID 与时间戳约定

- **ID**：ULID，**server 端生成**（thin-client 下 client 无需也无权生成 ID）
- **时间戳**：UTC int64 unix **milliseconds**
  - proto 字段直接 `int64`（不用 `google.protobuf.Timestamp`，避免 seconds+nanos 双字段的体积和 JSON 笨重）
  - SQLite 列：`INTEGER`，存毫秒
  - 客户端展示时按用户本地时区格式化（CLI/TUI 端用 `Intl.DateTimeFormat`）

### 9. 分发策略（双轨）

| 路径 | 体积 | 启动 | 用户类型 |
|---|---|---|---|
| `bun install -g dox` | ~10MB | 30-150ms | 有 Bun 的开发者（主力） |
| `bun build --compile` 单二进制 | ~55MB | 20-50ms | 零依赖用户 |

Release 页两种都提供。Node 路径不在首期发布范围，但代码保持 Node 兼容，未来按需加。

Server 端：Docker 镜像 + 静态二进制（Go 单文件，无 CGO 所以可任意交叉编译）。

## 已确定但还需细化的点

1. **状态管理库**：优先 Ink 内置 hooks（useState/useReducer）；复杂度真上来再考虑 Zustand/Jotai
2. **键位系统**：vim 风格 / 可配置 / 命令面板等具体设计待定
3. **数据模型**：todo 字段（标签、优先级、截止时间、子任务、循环任务等）尚未设计
4. **错误契约**：gRPC status code 与业务错误的映射规则（如 `NOT_FOUND` / `INVALID_ARGUMENT` 各覆盖哪些场景）
5. **备份策略**：建议 `dox-server backup` 子命令导出 + 文档里推荐用户配 cron + WAL checkpoint
6. **后台 poll 间隔**：默认 30s，是否暴露为客户端配置项待定

## 不要做的事（明确排除）

- **不做 local-first / 离线支持**（thin-client 是显式决策，见 §4）
- **不用 WebSocket / SSE**（多端实时性靠 poll 解决，不值得为此引入长连接基建）
- **不用 OAuth / JWT / 账号密码**（单用户自部署，Pairing Code Flow 已覆盖）
- **不用 `google.protobuf.Timestamp`**（统一 int64 unix ms，更轻更通用）
- **不用 GORM**（过重，反射开销大，SQL 不可控）
- **不用 grpc-gateway 替代品 Connect-RPC**（虽然技术上更现代，但作者已选择 grpc-gateway 因其更成熟）
- **不用 Atlas**（声明式 migration 对 SQLite 杀鸡用牛刀，选择 goose）
- **不用 mattn/go-sqlite3**（需要 CGO，影响分发，改用 modernc.org/sqlite）
- **不用 Bun-only API**（`bun:sqlite` / `Bun.serve` / `Bun.file` 等，保持 Node 兼容）
- **不用 OpenTUI / Rezi / blessed**（TS TUI 生态确定用 Ink）
- **不用 Electron**（未来桌面端用 Tauri）
- **不在 `@dox/core` 中引入任何 UI 库**（铁律）

## 命名

- **项目名**：`dox`（注：作者已确认采用，但作者应知悉"dox/doxing"在英文语境有负面联想，主要受众为中文圈）
- **二进制名**：`dox`（client）、`dox-server`（server）
- **npm 包**：`dox` 或 `@dox/cli`（占用情况需验证）
- **Docker 镜像**：待定（建议 `<author>/dox` 形式，参考 Ech0）

## 参考项目

- **Ech0**（lin-snow/Ech0）—— 作者的另一个自部署项目，工程模式可复用
- **Claude Code** —— Ink + React TUI 的最高水准参考（deepwiki 上有源码分析）
- **OpenCode (SST)** —— TS TUI 在 AI agent 场景的实践
- **gh CLI** —— 一个二进制兼顾 CLI/TUI 模式的标杆
- **lazygit / k9s** —— TUI 交互设计参考
- **Tailscale / Syncthing** —— Pairing Code Flow / 自部署单用户工具的认证体验参考

---

这份文档应该够下游 Agent 开始干活了。需要我补充任何遗漏的部分，或者把某个章节展开吗？
