# Design: skill-exempt-followup

Affects-subsystem: uncategorized

## Context

retune-aging-exemptions 归档后的现状：`isSkillFilePath` 以 `resolved.startsWith(AGENT_DIR)` 为硬门禁，只豁免 AGENT_DIR 下的技能（全局 `skills/{n}/` 与 npm `npm/node_modules/{pkg}/skills/{n}/`）；项目技能 `{cwd}/.pi/skills/{name}/` 不在 AGENT_DIR 下，未被豁免。绝对路径判断用 `path.startsWith("/") || path.startsWith("C:")` 硬编码，非 C 盘绝对路径（如 `D:/proj/.pi/skills/x/SKILL.md`）落入相对路径分支被错误 `join(AGENT_DIR, path)`。归档 smell 门禁挂账 I4/I5/I6/I7 与源文件行数超阈值。

用户提议以 `.pi/skills` 后缀匹配统一覆盖全局与项目技能——经核实：全局技能实际位于 `.pi/agent/skills`，`.pi/skills` 段匹配**覆盖不到全局**，因此只能作为 OR 分支新增而非替换。

## Goals / Non-Goals

**Goals:**

- 项目技能（`.pi/skills/{name}/`）read 结果获得完全豁免
- 绝对路径判定改标准 `isAbsolute`（修非 C 盘 bug）
- 三条豁免正则大小写不敏感（`i` 标志）
- `isOpenspecDocPath` 改名 `isOpenspecDesignPath`
- 测试 mock 基座收敛为共享 helper（`vi.hoisted`），消除三处漂移
- 路径豁免判断拆独立模块，`distill-helpers.ts` 回到行数阈值内
- 五个全量 mock 逐个判定并改造无意复刻者

**Non-Goals:**

- 不改 aging 主循环 / 阈值语义 / firstSeenCap 行为
- 不做豁免清单配置化（与 retune 的 Non-Goal 一致，留未来）
- 不动 edit/write Infinity 阈值路径

## Decisions

### D1 项目技能匹配为 OR 分支，不替换 AGENT_DIR 前缀路径

`.pi/skills/` 段匹配新增为独立分支（短路返回 true），AGENT_DIR 前缀 + `skills/{name}/` 段匹配保留——全局技能在 `.pi/agent/skills`，`/skills/` 段若无前缀门禁会误伤任意仓库的 skills 目录。npm 技能无单独正则的现状经核实为正确设计（AGENT_DIR 前缀天然覆盖），文档化即可。

- **Type**: one-off
- **Sediment-to**: none

### D2 绝对路径判定改 `isAbsolute`

`path.startsWith("/") || path.startsWith("C:")` → `isAbsolute(path)`。修复非 C 盘绝对路径被误判为相对路径的 bug（join 后永假）。

- **Type**: one-off
- **Sediment-to**: none

### D3 三条正则统一加 `i` 标志

Windows 文件系统大小写不敏感，`SKILL.MD`/`Design.md`/`invatriants.md` 异写漏豁免。加 `i` 后误伤面扩大有限（`docs/agent/` 前缀约束仍在）。

- **Type**: one-off
- **Sediment-to**: none

### D4 改名 `isOpenspecDesignPath`

收窄后仅匹配 `changes/<change>/design.md`，函数名与行为对齐。纯重命名，改 isAgingExempt 调用点 + 测试引用。

- **Type**: one-off
- **Sediment-to**: none

### D5 共享 mock 基座用 `vi.hoisted` 模式提取

`vi.mock` 工厂被 vitest 提升到文件顶，不能引用外部普通变量——mockConfig 等可变 mock 状态用 `vi.hoisted()` 声明后从共享 helper 导入。纯 helper（`mkState/mkMsg/trigger/rem`）直接函数导出。项目先例：`toolcall-args-helpers.ts`。

- **Type**: one-off
- **Sediment-to**: none

### D6 拆分顺序：先 mock 统一（I4）再拆文件

拆 `aging-exempt-paths.ts` 会改模块路径，所有 `vi.mock("../distill-helpers.js")` 引用要跟着变——mock 统一后只改共享 helper 一处。

- **Type**: one-off
- **Sediment-to**: none

### D7 I7 逐文件判定，不机械全改

五个全量 mock 逐个检查测试意图：若测试**刻意**隔离 distill-helpers（如 first-seen-cap 只测 cap 逻辑，不想被豁免干扰）则保留并加注释警示"生产逻辑变更需人工同步"；若是**无意复刻**（复制粘贴时的顺手）则改 `importOriginal` 部分 mock。以测试目的为判据，不追求形式统一。

- **Type**: one-off
- **Sediment-to**: none

## Risks / Trade-offs

- [`.pi/skills/` 段匹配的误伤面] → 同名业务目录 `x/.pi/skills/` 下的文件被豁免常驻——`.pi/` 前缀本身是 pi 约定目录，误伤概率低，接受
- [`i` 标志误伤] → `docs/agent/Adr.md` 等异写文件也豁免——前缀约束下风险极小，接受
- [mock 基座大迁移] → 一次动 6+ 测试文件，需全量回归（816 用例）兜底
- [拆分模块改 import 链] → 按 D6 顺序控制爆炸半径；vitest mock 路径同步验证

## Migration Plan

按 tasks 分三组推进（实现 → 测试重构 → 验证），每组内全量测试通过再进下一组。回滚 = revert。

## Open Questions

（无——D1 的路径事实已核实：全局技能在 `.pi/agent/skills`，用户提议的统一后缀方案不可行，OR 分支为修正形态）
