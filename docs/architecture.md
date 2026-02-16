# Happy 项目架构说明

> 最后更新：2026-02-13

## 📦 项目结构概览

```
happy-dev/
├── cli/              # CLI 命令行工具 + Daemon 守护进程 + Agent 运行时
├── server/           # 后端 API 服务
├── expo-app/         # 前端 Web 界面（Expo Web）
├── scripts/          # 开发环境启动/管理脚本
└── docs/             # 文档
```

---

## 🧩 三大核心服务

### 1. Server（后端 API 服务）

| 属性 | 值 |
|------|-----|
| 目录 | `server/` |
| 端口 | `3005` |
| 公网地址 | `https://server.vyibc.com` |
| 启动方式 | `corepack yarn tsx --env-file=.env.dev ./sources/main.ts` |

**职责：**
- 提供 RESTful API 和 WebSocket 服务
- 管理用户认证和会话
- 与 PostgreSQL 数据库交互（存储用户数据、会话记录等）
- 与 Redis 交互（缓存、消息队列）
- 与 MinIO 交互（文件/对象存储）
- 充当 Web 前端和本地 Daemon 之间的**消息中转站**

### 2. Expo Web（前端界面）

| 属性 | 值 |
|------|-----|
| 目录 | `expo-app/` |
| 端口 | `8754` |
| 公网地址 | `https://web.vyibc.com` |
| 启动方式 | `npx expo start --web` |

**职责：**
- 提供用户操作界面（浏览器访问）
- 显示 Agent 会话列表和聊天界面
- 展示代码变更、终端输出等实时信息
- 与 Server 通信，发送用户指令、接收执行结果
- 支持 HMR 热更新（修改代码后浏览器自动刷新，无需重启）

### 3. CLI Daemon（命令行守护进程）

| 属性 | 值 |
|------|-----|
| 目录 | `cli/` |
| 端口 | 无固定端口（通过 WebSocket 连接 Server） |
| 启动方式 | `node dist/index.mjs daemon start` |

**职责：**
- 在本地后台持续运行的守护进程
- 启动时向 Server **注册本机信息**（主机名、平台、版本等）
- 与 Server 保持 **WebSocket 长连接**，等待远程指令
- 收到「创建会话」指令后，调用 `spawnSession()` 启动 Agent 子进程
- 管理 Agent 子进程的生命周期（启动、停止、状态上报）
- 将 Agent 的执行结果**回传给 Server**

---

## 🤖 Agent 类型

系统支持多种 AI Agent 后端，通过 `AgentRegistry` 统一管理：

| Agent | 说明 | 启动命令 |
|-------|------|----------|
| **Codex** | OpenAI Codex Agent（默认） | `corepack yarn dev codex --force` |
| **Claude** | Anthropic Claude Agent | `corepack yarn dev claude --force` |
| **Gemini** | Google Gemini Agent | `corepack yarn dev gemini --force` |

所有 Agent 共享相同的接口（`AgentBackend`），实现统一的消息收发和工具调用能力。

---

## 🔄 请求执行流程

以用户在 `web.vyibc.com` 上输入 **「帮我写个 todo 小程序」** 为例：

```
  ┌──────────┐        ┌──────────┐        ┌──────────────────────┐
  │  浏览器   │        │  Server  │        │    你的 Mac（本地）    │
  │ Web 前端  │        │  (3005)  │        │                      │
  └─────┬────┘        └────┬─────┘        │  ┌───────┐  ┌──────┐ │
        │                  │              │  │Daemon │  │Codex │ │
        │                  │              │  └───┬───┘  └──┬───┘ │
        │                  │              │      │         │     │
  ① 输入消息             │              │      │         │     │
        ├─────────────────►│              │      │         │     │
        │              ② 转发指令         │      │         │     │
        │                  ├──────────────┼─────►│         │     │
        │                  │              │  ③ 启动 Agent  │     │
        │                  │              │      ├────────►│     │
        │                  │              │      │     ④ 调用 AI │
        │                  │              │      │     模型 API  │
        │                  │              │      │         │     │
        │                  │              │      │   ⑤ 在本地执行 │
        │                  │              │      │   创建文件    │
        │                  │              │      │   写入代码    │
        │                  │              │      │   运行命令    │
        │                  │              │      │         │     │
        │                  │              │  ⑥ 上报结果    │     │
        │                  │◄─────────────┼──────┤◄────────┤     │
        │              ⑦ 转发结果         │      │         │     │
        │◄─────────────────┤              │      │         │     │
  ⑧ 显示结果             │              │      │         │     │
        │                  │              └──────┴─────────┘     │
```

### 详细步骤

| 步骤 | 执行者 | 动作 |
|:----:|--------|------|
| ① | **Web 前端** | 用户在浏览器输入 "帮我写个 todo 小程序"，通过 API 发送到 Server |
| ② | **Server** | Server 根据会话信息，找到对应的机器（Daemon 注册过），通过 WebSocket 下发指令 |
| ③ | **Daemon** | Daemon 收到指令，调用 `spawnSession()` 在 tmux 中启动一个 Agent（如 Codex）子进程 |
| ④ | **Codex** | Codex 进程启动，将用户消息发送给 AI 模型 API（如 OpenAI） |
| ⑤ | **Codex** | AI 返回代码，Codex **在本地机器上**直接执行：创建文件、写入代码、运行终端命令 |
| ⑥ | **Codex → Daemon** | 执行结果通过 Daemon 回传给 Server |
| ⑦ | **Server** | Server 将结果转发给 Web 前端 |
| ⑧ | **Web 前端** | 浏览器实时显示 AI 回复、代码变更、终端输出等 |

### 关键要点

- ⚡ **代码在你的本地 Mac 上执行**，而不是在云端
- 🌉 **Daemon 是桥梁**，让远程网页能安全地控制本地机器
- 🔄 **Server 只做中转**，本身不执行任何代码
- 🔌 **Agent 可替换**，Codex/Claude/Gemini 都通过 `AgentRegistry` 注册，共享统一接口

---

## 🐳 基础设施服务

| 服务 | 端口 | 用途 |
|------|------|------|
| **PostgreSQL** | `5432` | 主数据库，存储用户、会话、配置等数据 |
| **Redis** | `6379` | 缓存、消息队列 |
| **MinIO** | `9000`（API）/ `9001`（控制台） | S3 兼容的对象存储，用于文件上传/下载 |

---

## 🛠 开发脚本

| 脚本 | 用途 |
|------|------|
| `scripts/start-dev.sh` | 启动完整开发环境（Docker + Server + Expo + Daemon） |
| `scripts/start-services.sh` | 启动开发环境但**不含 Daemon**（用于 Daemon 已单独运行的情况） |
| `scripts/start-agent.sh` | 手动启动 Agent 会话（支持 codex/claude/gemini 参数切换） |
| `scripts/bootstrap-local.sh` | 轻量版本地启动脚本 |
| `scripts/dev-daemon.sh` | Daemon 独立管理脚本 |

### 常用命令

```bash
# 启动完整开发环境
sh scripts/start-dev.sh

# 重启所有服务
sh scripts/start-dev.sh restart

# 仅重启 Docker + Server + Expo（不动 Daemon）
sh scripts/start-services.sh restart

# 手动启动 Codex Agent
sh scripts/start-agent.sh codex

# 手动启动 Claude Agent
sh scripts/start-agent.sh claude

# 手动启动 Gemini Agent
sh scripts/start-agent.sh gemini

# 查看服务状态
sh scripts/start-dev.sh status

# 停止所有服务
sh scripts/start-dev.sh kill
```

---

## 🌐 运行模式

| 模式 | 环境变量 | 说明 |
|------|----------|------|
| **本地模式** | `HAPPY_MODE=local` | Server 和 Web 都跑在本地，适合全栈开发调试 |
| **远程模式** | `HAPPY_MODE=remote` | 连接公网 `server.vyibc.com`，本地只运行 Daemon + Agent |

远程模式的环境变量配置：

```bash
HAPPY_MODE=remote
HAPPY_HOME_DIR=~/.happy-dev
HAPPY_VARIANT=dev
HAPPY_SERVER_URL=https://server.vyibc.com
HAPPY_WEBAPP_URL=https://web.vyibc.com
```
