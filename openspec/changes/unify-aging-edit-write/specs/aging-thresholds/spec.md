# aging-thresholds Delta

## ADDED Requirements

### Requirement: 所有工具成功结果共享统一 aging 阈值

aging 阈值选择器（selectAgingThreshold）SHALL 对所有工具的非错误、非大文件结果返回统一的 `agingThreshold` 配置值。edit/write 的成功结果 SHALL NOT 获得任何特殊阈值或永生豁免（`Number.POSITIVE_INFINITY` 路径 SHALL NOT 存在）。达到 `agingThreshold` 轮次的 edit/write 成功结果 SHALL 被正常达龄删除，与 read/bash 等工具行为完全一致。

#### Scenario: edit 成功结果按统一阈值达龄

- **WHEN** agingThreshold 为 20，某 edit 工具成功结果的存活计数在第 20 轮 context 事件达到 20
- **THEN** 该结果被达龄删除

#### Scenario: write 成功结果与 read 同龄删除

- **WHEN** 同一轮内产生的 write 成功结果与 read 结果，且两者均非错误、非大文件
- **THEN** 两者获得相同阈值（agingThreshold），相同轮次后同时被删除

#### Scenario: 无永生豁免路径

- **WHEN** 遍历任意工具（含 edit/write）的成功结果阈值选择
- **THEN** 返回值 SHALL 为有限数值，不存在 Infinity

### Requirement: 错误与大文件加速通道保持工具无关

阈值选择器 SHALL 维持 A>B 优先级：大文件结果（token ≥ distillThreshold）优先返回 `largeResultAging`；其次错误结果（isError）返回 `errorAgingThreshold`。该优先级判定 SHALL 与工具名正交——edit/write 的错误结果与大文件结果同样命中对应加速通道。

#### Scenario: edit 错误结果走错误通道

- **WHEN** edit 工具返回错误结果且非大文件
- **THEN** 阈值为 errorAgingThreshold（而非 agingThreshold）

#### Scenario: write 大文件结果走大文件通道

- **WHEN** write 工具结果 token 量 ≥ distillThreshold
- **THEN** 阈值为 largeResultAging，优先于错误判定

### Requirement: 存量计数无缝衔接

阈值统一后，既有会话 resume 时 SHALL 沿用 manifest 中已持久化的 agingCounts 计数：原被 Infinity 豁免的 edit/write 结果，在计数值 ≥ agingThreshold 的下一个 context 事件中 SHALL 被删除，SHALL NOT 要求迁移或计数重置。

#### Scenario: 长会话 resume 后原永生结果正常淘汰

- **WHEN** 某会话在旧版代码下累计了计数 516 的 edit 结果，升级后 resume
- **THEN** 下一轮 context 事件该结果即被删除（516 ≥ 20），无需等待重新计数
