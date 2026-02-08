# 远程接入说明

本文档用于说明如何从其他电脑远程控制本机的 Happy CLI 会话。

## 前置条件
- 本机已启动 `server` 与 `web`（Expo Web），并通过 Cloudflare Tunnel 暴露公网。
- `server` 与 `web` 使用同一套域名，例如：
  - `https://server.vyibc.com`
  - `https://web.vyibc.com`
- 本机 CLI 会话处于运行状态。

## 启动本机服务（示例）
```bash
cd /Users/huchangfeng/happy/server
corepack yarn dev

cd /Users/huchangfeng/happy/expo-app
EXPO_PUBLIC_HAPPY_SERVER_URL=https://server.vyibc.com corepack yarn web
```

## 远程控制流程
1) 在本机启动 CLI 并选择 Web Browser：
```bash
cd /Users/huchangfeng/happy/cli
HAPPY_SERVER_URL=https://server.vyibc.com \
HAPPY_WEBAPP_URL=https://web.vyibc.com \
corepack yarn dev
```
2) CLI 会生成一个链接，形如：
```
https://web.vyibc.com/terminal/connect#key=...
```
3) 在其他电脑的浏览器打开该链接，点击 Accept，即可进入终端页面。

## 重要注意事项
- `key` 为一次性短时有效，过期或 CLI 重启后需重新生成。
- 不能使用 `app.happy.engineering`，必须使用你自己的 `web` 域名。
- 如果页面异常，先强制刷新浏览器缓存（Cmd+Shift+R）。
- 若 CLI 已经有本地凭据，想重新生成 key，可执行：
```bash
./bin/happy.mjs auth login --force
```

## 验证检查
- 访问 `https://server.vyibc.com/` 应返回 `Welcome to Happy Server!`
- 访问 `https://web.vyibc.com/` 可正常加载 UI
