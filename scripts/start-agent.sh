#!/usr/bin/env bash
# 启动 Agent 脚本
# 用法: ./start-agent.sh [agent_name]
# 参数:
#   agent_name - 可选，指定 agent 类型，默认为 codex
#                支持: codex, gemini, claude 等

set -euo pipefail

# 脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# 项目根目录
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
# CLI 目录
CLI_DIR="$PROJECT_DIR/cli"

# 默认 agent 为 codex，可通过第一个参数替换
AGENT="${1:-codex}"

echo "🚀 启动 Agent: $AGENT"
echo "📁 工作目录: $CLI_DIR"

cd "$CLI_DIR"

# 设置环境变量并启动
HAPPY_MODE=remote \
HAPPY_HOME_DIR=~/.happy-dev \
HAPPY_VARIANT=dev \
HAPPY_SERVER_URL=https://server.vyibc.com \
HAPPY_WEBAPP_URL=https://web.vyibc.com \
corepack yarn dev "$AGENT" --force
