# Proposal: skill-exempt-followup

## Why

retune-aging-exemptions 归档后遗留两批问题：①技能文件豁免只覆盖 AGENT_DIR 下的全局/npm 技能，**项目技能（`{cwd}/.pi/skills/{name}/`）未豁免**——项目内建技能（如 quant-strategy 的 field-lineage）的 SKILL.md read 结果会被普通 aging 淘汰；②归档 smell 门禁挂账 5 项（I4 mock 基座三处漂移、I5 正则大小写敏感、I6 命名漂移、I7 全量 mock 复刻生产优先级、源文件超行数阈值）需集中清理。另发现一个真 bug：`isSkillFilePath` 用 `startsWith("C:")` 硬编码盘符判断绝对路径，非 C 盘绝对路径被误判为相对路径错误拼接。

## What Changes

> **实施后实际形态**：本 change 的 1.x/3.1 本地方案被并行会话的 shared-utils 单一事实源方案
> 取代（见 design.md 补记）。最终落地：豁免谓词公用 `@pi-atelier/shared-utils@1.2.0
> protected-docs.ts`（消费方：pi-context-manager aging 豁免 + pi-shepherd compact 回补），
> distill-helpers.ts 保留别名 re-export。以下保留原始方案描述供变更史参考。

- ~~isSkillFilePath 本地重构（OR 分支 + isAbsolute + i 标志）~~ → shared-utils `isSkillMdPath`（任意目录树 skills/{name}/SKILL.md，大小写不敏感；收窄：非 SKILL.md 不豁免；扩齐：.agents/git 包命中）
- ~~拆 aging-exempt-paths.ts~~ → 谓词上移群岛公共库，distill-helpers 262 行回阈值内
- I4：提取测试共享 mock 基座 `tests/aging-test-helpers.ts`，消除 8 个文件的基座复制与漂移
- I7：五个全量 mock 的手写 selectAgingThreshold 优先级复刻 → 真实实现 + 只 override estimateTokens

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `aging-exemptions`: 技能文件豁免 requirement 改为**引用 shared-utils 公用谓词语义**——任意目录树的 skills/{name}/SKILL.md 精确入口豁免（含项目级 .pi/skills、npm、.agents/git 包）；收窄声明：技能目录非 SKILL.md 文件（references/ 模板等）不再豁免；openspec design.md 与宪法文档语义不变。

## Impact

- **代码**：`distill-helpers.ts` 别名 re-export shared-utils 谓词；测试迁移到共享 mock 基座（-929 行）
- **依赖**：`@pi-atelier/shared-utils`（既有 `^1.1.1`，^ 语义兼容自动拿到 1.2.0，未新增依赖声明）
- **测试**：共享基座 `aging-test-helpers.ts` + 新增任意目录树/收窄用例
- **行为影响**：项目技能/任意树 SKILL.md read 结果常驻；技能目录非入口文件（references/ 等）不再豁免；openspec/宪法语义不变
- **配置**：无新增配置
