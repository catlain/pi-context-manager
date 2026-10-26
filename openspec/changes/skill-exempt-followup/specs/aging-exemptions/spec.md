# Delta Spec: aging-exemptions

## MODIFIED Requirements

### Requirement: 技能文件完全豁免
系统 SHALL 对 read 工具读取的技能文件给予 aging 完全豁免：不计数、不删除、不进入 firstSeenCap。技能文件覆盖三类：① pi agent 目录（`~/.pi/agent/`）下 `skills/<name>/` 内的文件；② agent 目录 `npm/node_modules/<pkg>/skills/<name>/` 内的文件（由 ① 的前缀门禁与段匹配天然覆盖，无单独匹配规则）；③ **项目级技能：任意路径下 `.pi/skills/<name>/` 路径段内的文件**。路径判定 SHALL 兼容 `/` 与 `\` 分隔符且大小写不敏感；绝对路径判定 SHALL 使用标准 `isAbsolute`（不得硬编码盘符）。

#### Scenario: 读取内联技能文件
- **WHEN** read 读取 `C:/Users/x/.pi/agent/skills/code-graph/SKILL.md`
- **THEN** 该 toolResult 获得完全豁免

#### Scenario: 读取 npm 安装的技能文件
- **WHEN** read 读取 `~/.pi/agent/npm/node_modules/pi-worktree/skills/worktree-setup/SKILL.md`
- **THEN** 该 toolResult 获得完全豁免

#### Scenario: 读取项目级技能文件
- **WHEN** read 读取 `D:/Project/Quant/.pi/skills/field-lineage/SKILL.md`（或相对形式 `.pi/skills/field-lineage/SKILL.md`、反斜杠形式）
- **THEN** 该 toolResult 获得完全豁免

#### Scenario: 非 C 盘绝对路径正确判定
- **WHEN** read 读取 `D:/proj/.pi/skills/foo/SKILL.md`（绝对路径但不以 `C:` 开头）
- **THEN** 不被误判为相对路径，按项目技能规则豁免

#### Scenario: 大小写异写仍豁免
- **WHEN** read 读取 `.../.PI/skills/foo/SKILL.MD` 或 `.../skills/foo/Skill.md`
- **THEN** 路径匹配大小写不敏感，该 toolResult 获得完全豁免

#### Scenario: agent 目录之外的普通 skills 路径不豁免
- **WHEN** read 读取 `D:/proj/skills/foo/SKILL.md`（无 `.pi/` 前缀且不在 agent 目录下）
- **THEN** 该 toolResult 不豁免，走普通 aging

### Requirement: OpenSpec 豁免收窄至 design 文档
系统 SHALL 仅对 read 工具读取的 `openspec/changes/<change>/design.md` 给予完全豁免。`openspec/changes/` 下其他文件（proposal.md、tasks.md、specs/ 增量规格等）与 `openspec/specs/` 主规格 SHALL NOT 豁免，走普通 aging。路径段匹配 SHALL 兼容 `/` 与 `\` 分隔符且大小写不敏感。

#### Scenario: 读取 change 的 design.md
- **WHEN** read 读取 `openspec/changes/retune-aging-exemptions/design.md`（或反斜杠形式）
- **THEN** 该 toolResult 获得完全豁免

#### Scenario: 读取 change 的 tasks.md 不再豁免
- **WHEN** read 读取 `openspec/changes/retune-aging-exemptions/tasks.md`
- **THEN** 该 toolResult 不豁免，走普通 aging

#### Scenario: 读取主规格不再豁免
- **WHEN** read 读取 `openspec/specs/aging-exemptions/spec.md`
- **THEN** 该 toolResult 不豁免，走普通 aging

#### Scenario: design.md 大小写异写仍豁免
- **WHEN** read 读取 `openspec/changes/foo/Design.md`
- **THEN** 大小写不敏感匹配，该 toolResult 获得完全豁免

### Requirement: 架构宪法文档豁免
系统 SHALL 对 read 工具读取的以下路径给予完全豁免：`docs/agent/adr/` 目录（含 INDEX.md 与编号 ADR 文件）、`docs/agent/adr-archive/` 归档目录、单文件形态 `docs/agent/ADR.md`、`docs/agent/INVARIANTS.md`、`docs/agent/designs/` 目录下的 Design Note。不位于 `docs/agent/` 前缀下的同名路径 SHALL NOT 豁免。路径匹配 SHALL 大小写不敏感。

#### Scenario: 读取编号 ADR
- **WHEN** read 读取 `docs/agent/adr/0390-ic-single-substrate-dual-view.md`
- **THEN** 该 toolResult 获得完全豁免

#### Scenario: 读取 ADR 索引与归档
- **WHEN** read 读取 `docs/agent/adr/INDEX.md` 或 `docs/agent/adr-archive/0368-xxx.md`
- **THEN** 该 toolResult 获得完全豁免

#### Scenario: 读取单文件形态 ADR
- **WHEN** read 读取 `docs/agent/ADR.md`
- **THEN** 该 toolResult 获得完全豁免

#### Scenario: 读取 INVARIANTS 与 Design Note
- **WHEN** read 读取 `docs/agent/INVARIANTS.md` 或 `docs/agent/designs/回测引擎.md`
- **THEN** 该 toolResult 获得完全豁免

#### Scenario: docs/agent 前缀外同名文件不豁免
- **WHEN** read 读取 `results/designs/x.md` 或 `docs/ADR.md` 或项目根 `ADR.md`
- **THEN** 该 toolResult 不豁免，走普通 aging

#### Scenario: 宪法文档大小写异写仍豁免
- **WHEN** read 读取 `docs/agent/Invariants.md`（INVARIANTS.md 的大小写异写）或 `docs/agent/adr/index.md`
- **THEN** 大小写不敏感匹配，该 toolResult 获得完全豁免
