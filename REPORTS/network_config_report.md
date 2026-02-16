# 网络重定向与 Expo 开发环境配置报告 (2026-02-16)

## 1. 核心变更概览
为了支持局域网访问以及更稳定的内网穿透（Cloudflare Tunnel），我们对项目的开发配置进行了以下调整：

- **端口变更**：将 Expo Web 服务器的默认端口从 `8081` 更改为 `8754`。
- **局域网支持**：在启动 Expo 时启用了 `--host lan`，允许通过本地 IP（如 `192.168.10.109`）访问。
- **内网穿透优化**：修复了 Cloudflare Tunnel 的 DNS 解析和协议匹配问题。

## 2. 具体配置信息

### 2.1 本地服务配置
- **Expo Web**: `http://192.168.10.109:8754` (或 `localhost:8754`)
- **API Server**: `http://localhost:3005` (内网) / `https://server.vyibc.com` (公网)

### 2.2 穿透域名配置 (Cloudflare Tunnel)
- **前端 Web**: `https://web.vyibc.com` -> `http://192.168.10.109:8754`
- **前端备份**: `https://websb.vyibc.com` -> `http://192.168.10.109:8754`
- **后端 API**: `https://server.vyibc.com` -> `http://192.168.10.109:3005`

> **重要提示**：内网穿透中将 Origin HTTPS 修改为了 **HTTP**，因为本地开发环境不自带 SSL 证书。

## 3. 修改的文件清单
- `scripts/start-dev.sh`: 优化启动逻辑，增加端口清理和 `--host lan` 支持。
- `scripts/start-services.sh`: 同步更新启动参数。
- `cli/.env.dev-local-server`: 更新全局变量 `HAPPY_WEBAPP_URL=http://localhost:8754`。
- `expo-app/src-tauri/tauri.conf.json`: 更新 Tauri 调试地址。
- `expo-app/package.json`: 增加 `npm run dev` 快捷指令。
- `docs/architecture.md`: 更新项目架构文档中的端口说明。

## 4. 常用维护指令
- **重新启动所有开发服务**：`sh scripts/start-dev.sh restart`
- **查看服务运行状态**：`sh scripts/start-dev.sh status`
- **刷新 DNS 缓存 (Mac)**：`sudo killall -HUP mDNSResponder`
