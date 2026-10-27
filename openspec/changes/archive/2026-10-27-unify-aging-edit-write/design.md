Affects-subsystem: uncategorized

## Context

pi-context-manager 的 aging（上下文遗忘）在 `distill-helpers.ts` 的 `selectAgingThreshold` 中按工具/结果特征选择达龄阈值，现行三层结构（A>B 优先级）：

```
A. 大文件 (token >= distillThreshold)      → largeResultAging (默认 5)
B. isError                                  → errorAgingThreshold (默认 5)
C. edit/write 且非错误  → Infinity  ★ 本次删除
D. 其余（read/bash/grep/edit/write 错误…） → agingThreshold (默认 20)
```

C 分支由 06-26 ae61668 引入（"edit/write 成功结果豁免 aging，保留工作记忆"）。a45e 会话（01a175f9，10-26 启动，约 500 轮）实测证伪：107 条 edit/write 成功结果永生（计数最高 516，仍在无意义累加），占轮龄≥20 存活 toolResult 的 59%（107/181）；500 轮前的 edit 确认对当前工作记忆信噪比为负——文件最新状态由 read 提供（20 轮即删），确认片段（diff）比 read 过期更快。用户决策：统一共享 `agingThreshold`，设 20 就都是 20。

注意：同会话中 88 轮的 read 存留是另一回事——该会话 10-26 10:10 启动时 jiti 加载的是 f32c40e（10-21）宽豁免版谓词，19:17 的 retune（6cd9291）收窄对其不生效（运行中会话不热重载扩展）。现行代码已修复，不属于本变更范围。

## Goals / Non-Goals

**Goals:**

- edit/write 成功结果与 read/bash 等工具一致，按 `agingThreshold` 正常达龄删除
- 既有长会话 resume 后无需迁移：manifest 中已持久化的 agingCounts 计数直接衔接（≥20 的下一轮 context 事件即删）
- 移除计数无意义累加（Infinity 路径的 `count >= Infinity` 永假副作用）

**Non-Goals:**

- 不改 read 完全豁免层（isAgingExempt / protected-docs 公用谓词）
- 不改错误结果与大文件的加速通道（errorAgingThreshold / largeResultAging 及 A>B 优先级）
- 不改 firstSeenCap 语义
- 不引入"轮龄降级为单行摘要"或"同文件聚合"等更复杂的工作记忆机制（若未来统一阈值后仍感工作记忆不足，另开变更）
- 不处理运行中会话不热重载旧代码的固有限制

## Decisions

### D1: 删除 Infinity 分支，edit/write 成功结果直接落普通 agingThreshold

实现为删代码而非加配置：`selectAgingThreshold` 中 `if ((ctx.toolName === "edit" || ctx.toolName === "write") && !ctx.isError) return Number.POSITIVE_INFINITY;` 整段移除，无需替代分支——控制流自然落入普通路径返回 `cfg.agingThreshold`。不保留开关（如 `editWriteExempt: false`）：该行为已被证伪，保留开关延长死代码生命周期；回滚走 git revert。

- **Type**: one-off
- **Sediment-to**: none

### D2: 错误/大文件通道维持现状

edit/write 的错误结果继续走 errorAgingThreshold，大文件（含 edit/write 产出的大结果）继续走 largeResultAging 且优先级 A>B 不变。理由：这两个通道是按"信息价值衰减速度"设计的（错误重试后即失效、超大结果 distill 已另行处理），与工具种类正交，本次不动。

- **Type**: one-off
- **Sediment-to**: none

## Risks / Trade-offs

- **工作记忆变薄**：20 轮后"改过哪些文件"的确认痕迹消失。缓解：edit/write 确认本身极短（路径+行号），丢失的信息可由 distill 摘要与记忆文件承担；若实测不足再评估单行摘要降级方案（Non-Goal 已列）。
- **频繁编辑场景的确认闪失**：连续 20+ 轮都在编辑同一批文件的长任务中，早期确认先于任务完成被删。可接受——同文件后续 edit 确认天然携带路径信息，且 read 最新内容仍在上下文内。
- **测试反转风险**：现有单测断言 edit/write→Infinity 需全部反转为→agingThreshold，遗漏会导致 spec 与实现漂移。tasks 中单列核对项。
