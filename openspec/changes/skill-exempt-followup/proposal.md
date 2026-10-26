# Proposal: skill-exempt-followup

## Why

retune-aging-exemptions 归档后遗留两批问题：①技能文件豁免只覆盖 AGENT_DIR 下的全局/npm 技能，**项目技能（`{cwd}/.pi/skills/{name}/`）未豁免**——项目内建技能（如 quant-strategy 的 field-lineage）的 SKILL.md read 结果会被普通 aging 淘汰；②归档 smell 门禁挂账 5 项（I4 mock 基座三处漂移、I5 正则大小写敏感、I6 命名漂移、I7 全量 mock 复刻生产优先级、源文件超行数阈值）需集中清理。另发现一个真 bug：`isSkillFilePath` 用 `startsWith("C:")` 硬编码盘符判断绝对路径，非 C 盘绝对路径被误判为相对路径错误拼接。

## What Changes

- `isSkillFilePath` 新增项目技能匹配：路径段 `.pi/skills/{name}/`（OR 关系，不替换 AGENT_DIR 前缀路径——全局技能在 `.pi/agent/skills`，`.pi/skills` 段覆盖不到）；`startsWith("C:")` 改为 `isAbsolute` 标准判断
- 文档化事实：npm 技能无需单独正则（AGENT_DIR 前缀 + `skills/{name}/` 段匹配天然覆盖 `npm/node_modules/{pkg}/skills/{name}/`）
- I5：三条豁免正则（skill / openspec design / arch doc）统一加 `i` 标志，防 Windows 大小写异写漏豁免
- I6：`isOpenspecDocPath` 改名 `isOpenspecDesignPath`（收窄后名实不符）
- 行数治理：`distill-helpers.ts`（281 行）的路径豁免判断组拆出独立模块（I4 之后做，mock 已统一则只改一处）
- I4：提取测试共享 mock/helper 基座（`vi.hoisted` 模式），消除 6 个文件的基座复制与漂移
- I7：first-seen-cap / error-aging / handle-context-aging / handle-context-manifest / resume-manifest 五个全量 mock 逐个判定"刻意隔离 vs 无意复刻"，无意复刻者改部分 mock（`importOriginal` 保真实生产逻辑）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `aging-exemptions`: 技能文件豁免 requirement 扩展——新增项目技能（`.pi/skills/`）场景与路径大小写不敏感约束；绝对路径判定改标准 `isAbsolute`。

## Impact

- **代码**：`distill-helpers.ts`（isSkillFilePath 重构 + i 标志 + 改名）→ 拆分出 `aging-exempt-paths.ts`；`handle-context.ts`（引用同步）
- **测试**：6+ 文件迁移到共享 mock 基座；新增项目技能/大小写用例；5 个全量 mock 判定改造
- **行为影响**：项目技能 read 结果常驻上下文；大小写异写路径（`SKILL.MD`、`Design.md`、`.PI/skills/`）正确豁免；非 C 盘绝对路径不再误判
- **配置**：无新增配置
