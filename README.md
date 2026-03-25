# TypeScript LangChain 简单聊天机器人

这是一个最小可运行的 `TypeScript + LangChain` 终端聊天机器人：

- 支持对话历史（上下文会带入）
- 支持 `/clear` 清空历史
- 支持 `/exit` 退出

## 1. 安装（已按你的要求使用 nvm + nrm + pnpm）

```bash
cd /Users/jimi/Desktop/My/langchain

# 先切到 Node 22（示例）
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"
nvm use 22

# 镜像源：taobao（示例）
nrm use taobao

# 安装依赖
pnpm install
```

## 2. 配置环境变量

复制一份示例：

```bash
cp .env.example .env
```

本项目默认只使用 Grok/xAI（API 兼容 OpenAI Chat 接口），环境变量主要是：

- `API_KEY`：Grok/xAI 的 API Key
- `MODEL`：模型名（默认 `grok-4-1-fast`）
- `BASE_URL`：基础地址（默认 `https://api.x.ai/v1`）

可选：

- `TEMPERATURE`：默认 `0.7`
- `TIMEOUT_MS`：默认 `60000`
- `DEBUG`：开启排查（推荐填 `1`）

## 3. 运行

```bash
pnpm dev
```

运行后：

- 输入你的消息直接聊天
- 输入 `/clear` 清空历史
- 输入 `/exit` 退出

## 代码入口

- 主程序：`src/index.ts`
