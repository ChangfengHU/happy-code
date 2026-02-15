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

## ✨ 相比原版的主要优化

本项目 Fork 自 [slopus/happy](https://github.com/slopus/happy)，我们进行了以下增强：

### 🤖 Gemini 模型支持
- 完整支持 Google Gemini 2.5 Pro/Flash/Lite 系列模型
- 支持在会话中显示模型名称标识（如 `[Gemini 2.5 Pro]`、`[Sonnet 4]`）

### 🖥️ 体验优化 (Web/Mobile)
- **会话悬停操作菜单**：鼠标悬停时显示归档和删除按钮
- **操作二次确认**：使用 Modal.confirm 防止误操作
- **优化删除按钮样式**：红色背景和图标标识危险操作
- **文件编辑器增强**：
  - **拖拽调整宽度**：支持通过拖拽调整文件编辑器面板大小
  - **支持 UTF-8 编码**：彻底解决文件内容在 Web 和移动端的中文乱码问题
  - **代码滚动体验**：支持代码横向滚动且不强制换行，优化查看体验

### 🛡️ 权限模式 UI
- 新增权限模式选择器组件
- 更直观的权限配置界面

### 🔧 开发工具增强
- **Daemon 自动重启**：强制认证后自动重新启动 daemon
- **本地开发脚本**：简化开发环境启动流程
- **调试信息增强**：在 SessionRestartButton 添加详细调试信息


### 🌍 国际化支持
- 完善的中文翻译支持
- 多语言界面切换

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
