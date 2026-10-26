# Design: retune-aging-exemptions

Affects-subsystem: uncategorized

## Context

pi-context-manager 的 aging（遗忘）机制有三层路径：完全豁免（`isAgingExempt` → 不计数、不删、不过 firstSeenCap）、Infinity 阈值豁免（edit/write 成功结果 → 计数但不删）、普通 aging（`agingThreshold` 轮淘汰）。

当前完全豁免清单（`distill-helpers.ts`）覆盖三类路径：skills 文件、`.pi/plans/`、`openspec/changes|specs/`。实证（a45e 会话 manifest）：openspec 工作文档的 read 结果大量常驻上下文永不淘汰；同时架构宪法三件套（ADR、INVARIANTS、Design Note）无任何豁免，会按 agingThreshold 快速淘汰。用户已将 agingThreshold 从 50 调至 10，低价值常驻与高价值快淘的矛盾放大。

约束：豁免清单硬编码于 `distill-helpers.ts` 正则；`isAgingExempt` 仅对 `read` 工具生效；现有 14 个豁免单测用例需同步重写。

## Goals / Non-Goals

**Goals:**

- 豁免清单重新调音：保留 skills；openspec 收窄为仅 `openspec/changes/*/design.md`；新增 ADR（`docs/agent/adr/`、`docs/agent/adr-archive/`、`docs/agent/ADR.md`）、`docs/agent/INVARIANTS.md`、`docs/agent/designs/*.md`
- 取消 `.pi/plans/`、`openspec/changes/`（除 design.md）、`openspec/specs/` 的豁免，使其走普通 aging
- 单元测试完整覆盖新清单的正反用例

**Non-Goals:**

- 不做豁免清单配置化（settings.json globs）——留作未来演进
- 不改 edit/write 的 Infinity 阈值路径（其计数无意义累加的瑕疵另行处理）
- 不改 agingThreshold / largeResultAging / errorAgingThreshold 的数值语义与配置读取逻辑

## Decisions

### D1 收窄硬编码正则，不做配置化

本次调整以最小改动收窄/新增硬编码正则完成。配置化（`agingExemptGlobs`）引入新配置面：glob 匹配语义、默认值合并、正则转义边界，而豁免清单调整频率低（首次调整），不值得引入额外维护面。

- **Type**: one-off
- **Sediment-to**: none

### D2 openspec 豁免收窄为 `openspec/changes/*/design.md`

change 名为任意路径段，仅锚定文件名 `design.md` 精确匹配；`proposal.md`、`tasks.md`、`specs/` 增量、主规格 `openspec/specs/` 全部走普通 aging。理由：design.md 是低频高价值的决策记录（豁免收益高）；tasks.md 高频参照但内容持续变化，留在上下文的是旧快照，aging 掉逼着重读反而拿到实况。

- **Type**: one-off
- **Sediment-to**: none

### D3 新增独立函数 `isArchDocPath` 而非扩展现有判断

宪法三件套匹配独立成函数（`docs/agent/adr/`、`docs/agent/adr-archive/`、`docs/agent/ADR.md`、`docs/agent/INVARIANTS.md`、`docs/agent/designs/`），不塞进 `isOpenspecDocPath`——两者语义域不同（架构宪法 vs 变更工作文档），路径形态也不同（`docs/agent/` 前缀 vs `openspec/` 段）。`docs/agent/` 前缀约束防止业务文件误伤（如 `results/designs/`）。

- **Type**: one-off
- **Sediment-to**: none

### D4 豁免仍仅对 read 生效

与现有语义一致：宪法文档的 edit/write 结果继续走 Infinity 阈值路径（含 firstSeenCap 大结果截断），不受本变更影响。

- **Type**: one-off
- **Sediment-to**: none

## Risks / Trade-offs

- [tasks.md 等 openspec 文档 10 轮即删，长实施会话需更频繁重读] → 用户已知情并选择；若重读开销疼痛，未来可调 agingThreshold 或做豁免配置化（Non-Goal 已声明）
- [正则误伤：`designs/`、`ADR.md` 等段名可能撞业务文件] → `docs/agent/` 前缀 + 精确文件名锚定；测试覆盖正反例（如 `docs/agent/designs/x.md` 命中、`results/designs/x.md` 不命中）
- [取消豁免后存量恢复会话行为变化] → 原豁免条目本就无 agingCounts 记录，取消豁免后从 count=1 起算，10 轮后自然淘汰，无需迁移
- [不同项目 ADR 布局差异（单文件/目录/归档）] → 三种形态全覆盖（`adr/`、`adr-archive/`、`ADR.md`），单测以 quant-strategy 与 catlain 两种真实布局为用例

## Migration Plan

改代码 → 单测全绿 → typecheck → 常规 npm patch 发版。回滚 = revert 提交。

## Open Questions

（无——豁免清单、ADR/INVARIANTS/designs 边界均已在探索阶段与用户确认）
