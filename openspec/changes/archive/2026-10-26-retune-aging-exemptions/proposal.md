# Proposal: retune-aging-exemptions

## Why

当前 aging 完全豁免规则把 `.pi/plans/`、`openspec/changes/`、`openspec/specs/` 整目录纳入豁免，长会话中这些文档的 read 结果永不淘汰（a45e 会话实证：openspec 文档 read 结果大量常驻上下文）。而真正应该长寿命的架构宪法三件套——ADR、INVARIANTS、Design Note——反而没有任何豁免。agingThreshold 已从 50 调至 10，豁免名单里的低价值常驻与高价值文档的快速淘汰形成了本末倒置，需要重新调音豁免清单。

## What Changes

- 取消 `.pi/plans/` 的 aging 完全豁免（roadmap 计划文档走普通 aging）
- 取消 `openspec/changes/` 整目录豁免，收窄为仅豁免 `openspec/changes/*/design.md`
- 取消 `openspec/specs/` 整目录豁免（主能力规格走普通 aging）
- 新增 ADR 豁免：`docs/agent/adr/`（含 INDEX.md 与 NNNN-slug.md）、`docs/agent/adr-archive/`、`docs/agent/ADR.md`（单文件形态）
- 新增 `docs/agent/INVARIANTS.md` 豁免
- 新增 `docs/agent/designs/*.md`（Design Note）豁免
- skills 豁免（`skills/` 与 `node_modules/*/skills/`）保持不变
- 同步更新豁免路径单元测试（现 `aging-exempt-unit.test.ts` 14 个用例）

## Capabilities

### New Capabilities

- `aging-exemptions`: aging 完全豁免的路径识别规则——哪些 read 结果不计数、不删除、不进 firstSeenCap，以及豁免仅对 read 工具生效的边界约束。

### Modified Capabilities

（无——本仓库 openspec 刚初始化，无既有主规格）

## Impact

- **代码**：`distill-helpers.ts`（移除 isPlansFilePath 调用、收窄 isOpenspecDocPath、新增 ADR/INVARIANTS/Design Note 匹配函数）、`handle-context.ts`（isAgingExempt 组装逻辑）
- **测试**：`distill/aging-exempt-unit.test.ts` 重写豁免清单用例，新增 ADR 家族、design.md 收窄、plans/specs 不再豁免的正反用例
- **行为影响**：所有使用 pi 的会话——openspec 工作文档与 plans 文档的 read 结果改为按 agingThreshold（当前 10）淘汰；ADR/INVARIANTS/Design Note 的 read 结果常驻上下文
- **配置**：无新增配置项，豁免清单仍为代码内置（配置化留作未来演进）
