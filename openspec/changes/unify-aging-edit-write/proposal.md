## Why

a45e 会话（01a175f9，10-26 启动，500+ 轮）实测：107 条 edit/write 成功结果永不达龄（计数最高累至 516 轮），占存活 toolResult 的 62%（107/181 条轮龄≥20）。06-26 ae61668 引入的 "edit/write 成功结果豁免 aging，保留工作记忆" 设计被实践证伪：20 轮外的 edit 确认工作记忆价值≈0（文件最新状态由 read 提供，而 read 结果 20 轮即删——信息价值与留存时长倒挂），确认结果沦为纯 token 死重且稀释近期工作记忆信噪比。用户决策：所有工具统一共享 `agingThreshold` 轮次，设 20 就都是 20。

## What Changes

- 删除 `selectAgingThreshold` 中 edit/write 非错误结果的 `Number.POSITIVE_INFINITY` 分支，成功结果走普通 `agingThreshold`（与 read/bash 等一致）
- edit/write 的**错误**结果维持现状：非大文件走 `errorAgingThreshold`（默认 5），大文件（token ≥ distillThreshold）走 `largeResultAging`（A>B 优先级不变）
- firstSeenCap 语义不变：edit/write 结果首次出现时仍按 token 上限检查
- read 完全豁免层（isAgingExempt / protected-docs 谓词）不受影响
- **取代声明**：本变更推翻 ae61668 的 "edit/write 永生豁免" 设计决策；计数无意义累加问题随 Infinity 移除自然消失

## Capabilities

### New Capabilities

- `aging-thresholds`: 统一 aging 阈值选择策略——所有工具的成功结果共享 `agingThreshold`，错误/大文件走加速通道，无任何工具获得永生豁免

### Modified Capabilities

（无——`aging-exemptions` 主规格管辖的 read 完全豁免层不变）

## Impact

- **代码**：`pi-context-manager/src/distill-helpers.ts` 的 `selectAgingThreshold`（删一个分支）；`handle-context.ts` 主循环无需改动（Infinity 消失后 `count >= threshold` 自然生效）
- **测试**：`selectAgingThreshold` 现有单测中 edit/write→Infinity 的断言需反转为→agingThreshold；新增统一阈值用例
- **行为变化**：既有长会话 resume 后，原被 Infinity 豁免的 edit/write 结果将在下一轮 context 事件起按计数正常达龄删除（计数已持久于 manifest，无缝衔接）
- **文档**：`shared.ts` 中 AgingConfig 注释、aging-exempt-semantics 记忆需同步更新
