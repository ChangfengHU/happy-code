<div align="center"><img src="/.github/logotype-dark.png" width="400" title="Happy Coder Pro" alt="Happy Coder Pro"/></div>

<h1 align="center">
  Happy Coder Pro - 增强版移动端/Web 客户端
</h1>

<h4 align="center">
支持 Claude Code、Codex 和 Gemini，随时随地使用端到端加密访问 AI 编程助手。
</h4>

<div align="center">

[📱 **iOS App**](https://apps.apple.com/us/app/happy-claude-code-client/id6748571505) • [🤖 **Android App**](https://play.google.com/store/apps/details?id=com.ex3ndr.happy) • [🌐 **Web App**](https://web.vyibc.com) • [💬 **Discord**](https://discord.gg/fX9WBAhyfD)

</div>

<img width="5178" height="2364" alt="github" src="/.github/header.png" />

---

## 🚀 快速开始

### 第一步：安装 CLI

```bash
npm install -g happy-coder-pro
```

### 第二步：启动 Happy Pro

```bash
# 替代 claude 命令
happy-pro

# 替代 codex 命令
happy-pro codex
```

---

## ✨ 核心特性与功能

本项目 Fork 自 [slopus/happy](https://github.com/slopus/happy)，在原版基础上新增并支持以下功能：

### 🤖 Gemini 模型支持
- **完整支持 Gemini 系列**：包括 Google Gemini 2.5 Pro/Flash/Lite 系列模型
- **模型名称标识**：在会话中直接显示当前使用的模型标识（如 `[Gemini 2.5 Pro]`、`[Sonnet 4]`）

### 🖥️ 交互体验 (Web/Mobile)
- **快捷会话管理**：鼠标悬停会话时可快速进行归档或删除操作
- **操作二次确认**：对归档、删除等关键操作增加二次确认弹窗，防止误操作
- **文件编辑器特性**：
  - **自适应布局**：支持通过拖拽自由调整文件编辑器面板的宽度
  - **全字符集支持**：原生支持 **UTF-8** 编码，彻底解决中文乱码问题
  - **优化阅读体验**：支持代码横向滚动且不强制换行，保持代码原始排版

### 🛡️ 权限管理
- **可视化权限切换**：新增权限模式选择器，支持直观配置权限级别

### 🔧 开发与调试工具
- **智能 Daemon 管理**：强制认证后支持自动重新启动渲染进程
- **本地开发优化**：提供简化的本地开发环境启动脚本，并增强了 Session 调试信息

### 🌍 国际化支持
- **全界面中文支持**：提供完善的中文翻译
- **多语言自由切换**：支持在不同语言界面间无缝切换


---

## 🔧 开发者模式

如果你想使用开发服务器，可以这样启动：

```bash
cd /Users/huchangfeng/happy-dev/cli
HAPPY_MODE=remote \
HAPPY_HOME_DIR=~/.happy-dev \
HAPPY_VARIANT=dev \
HAPPY_SERVER_URL=https://server.vyibc.com \
HAPPY_WEBAPP_URL=https://web.vyibc.com \
corepack yarn dev --force
```

---

## 📦 项目组件

| 组件 | 说明 |
|------|------|
| [expo-app](./expo-app) | Web UI + 移动端客户端 (Expo) |
| [cli](./cli) | 命令行工具，支持 Claude Code、Codex 和 Gemini |
| [server](./server) | 后端服务器，负责加密同步 |

---

## 🔐 安全特性

- **端到端加密**：你的代码在设备间传输时始终保持加密状态
- **开源透明**：可以自行审计代码，无遥测、无追踪
- **本地优先**：敏感数据不会离开你的设备

---

## 📱 设备切换

在电脑上运行 `happy-pro` 替代 `claude`，或 `happy-pro codex` 替代 `codex`。当你想从手机控制编程助手时，它会以远程模式重启会话。想切回电脑？只需按下任意键。

---

## 🙏 致谢

感谢 [slopus/happy](https://github.com/slopus/happy) 原项目团队的出色工作！

---

## 📄 License

MIT License - 详见 [LICENSE](LICENSE)。
