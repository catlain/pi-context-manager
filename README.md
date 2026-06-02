> 📖 **[pi-atelier 实战指南](https://catlain.github.io/pi-atelier/)** — 从零教会你使用 pi-atelier 扩展生态

# pi-context-manager

[源码仓库](https://github.com/catlain/pi-context-manager) | [npm](https://www.npmjs.com/package/pi-context-manager)

pi-coding-agent 的 **上下文生命周期管理** — 工具结果格式化、distill 自动压缩、aging 淘汰、payload 录制分析。

## 解决什么问题

AI 编程助手在长会话中积累上下文极快——工具输出堆叠、旧消息变得无关、token 预算耗尽。pi-context-manager 自动管理上下文窗口：

- **工具结果格式化**：bash 去 ANSI 码、web search 提取摘要、GitHub API 数据精简、code-graph 输出压缩
- **Distill 自动压缩**：将历史工具结果替换为紧凑摘要，保留关键信息
- **Context aging**：按可配置轮数淘汰旧消息，保持上下文聚焦
- **Payload 录制分析**：录制 provider 请求，事后分析 token 分布、昂贵调用、增长趋势

## 安装

```bash
pi install git:github.com/catlain/pi-context-manager
```

## 命令

| 命令 | 说明 |
|------|------|
| `/context` | TUI 面板：可视化上下文使用（分类浏览、工具详情、标记删除） |
| `/record [on\|off]` | 开关 provider payload 录制 |
| `/distill-config [N]` | 查看/设置 distill token 阈值 |
| `/processor-config [N\|off]` | 查看/设置 tool-result-processor 阈值 |
| `/aging-config [N\|off]` | 查看/设置 aging 淘汰轮数 |
| `/context-clean [sessionId]` | 清理持久化数据 |

## 工具

### `payload_analyze` — 分析录制文件

```bash
# 列出录制文件
payload_analyze(action: "list")

# 单文件分析（token 分布、工具调用统计）
payload_analyze(action: "single", payloadPath: "recording-xxx.jsonl")

# Token 预算分析（system/tools/history 构成）
payload_analyze(action: "budget", payloadPath: "...")

# 上下文增长趋势（token 随请求变化的曲线）
payload_analyze(action: "growth")

# 最贵的工具调用（按 token 排序）
payload_analyze(action: "expensive", topN: 10)

# 精确定位消息（按索引、范围、关键词、工具名）
payload_analyze(action: "messages", msgRange: "last:5")
payload_analyze(action: "messages", toolName: "code_graph*")
```

## 工作原理

### 工具结果处理链

工具返回结果后，自动经过格式化链：

1. **code-graph** → 压缩 JSON 输出，保留关键签名
2. **Web search** → 提取标题、URL、摘要，去掉模板
3. **Web reader** → 截断大页面，提取核心内容
4. **GitHub** → 精简 issue/PR/commit 数据
5. **Bash** → 去 ANSI 码，截断长输出
6. **MCP 错误** → 清理冗长的错误堆栈

### Distill 压缩

格式化后，distill 将历史工具结果替换为紧凑摘要。保留最近的 N 条完整结果，更早的自动摘要。

### Aging 淘汰

超过配置轮数的消息标记为可淘汰，在 compaction 时优先移除。

## 使用场景

| 场景 | 功能 | 效果 |
|------|------|------|
| **长编程会话** | Distill + Aging | 上下文聚焦近期工作 |
| **Web 调研** | Web 格式化 | 干净摘要替代原始 HTML |
| **调试 token 用量** | Payload 录制 + 分析面板 | 精确看到 token 去向 |
| **code-graph 输出** | JSON 格式化 | 压缩冗长输出，保留关键信息 |

## 配置

存储在 `~/.pi/agent/settings.json` 的 `context` section：

```json
{
  "context": {
    "distill": true,
    "aging": true,
    "record": false
  }
}
```

通过 `/distill-config`、`/processor-config`、`/aging-config` 命令动态调整。

## 架构

```
pi-context-manager/
├── index.ts                     # 入口：注册处理器 + distill + 面板
├── formatters.ts                # 工具结果格式化主入口
├── formatters-codegraph.ts      # code-graph 输出压缩
├── formatters-web.ts            # Web search/reader 格式化
├── formatters-gh.ts             # GitHub 数据格式化
├── formatters-errors.ts         # MCP 错误清理
├── formatters-mcp-json.ts       # 通用 MCP JSON 格式化
├── tool-result-processor.ts     # 工具结果处理引擎
├── distill-helpers.ts           # Distill 辅助函数
├── context.ts                   # Context 面板逻辑
├── recording.ts                 # Payload 录制
├── payload/                     # Payload 分析子目录
│   └── ...                      # 分析工具（budget/growth/expensive/messages 等）
└── tests/                       # 测试
```

**依赖**：
- `@pi-atelier/shared-utils` — 配置 API、工具输出格式化
- `@earendil-works/pi-coding-agent` — ExtensionAPI（peer）

## License

MIT
