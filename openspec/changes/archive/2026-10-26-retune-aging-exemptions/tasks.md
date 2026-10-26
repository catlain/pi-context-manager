# Tasks: retune-aging-exemptions

## 1. 豁免规则实现（distill-helpers.ts）

- [x] 1.1 收窄 `isOpenspecDocPath`：仅匹配 `openspec/changes/<change>/design.md`，移除 changes 其他文件与 `openspec/specs/` 的匹配
- [x] 1.2 新增 `isArchDocPath`：匹配 `docs/agent/adr/`、`docs/agent/adr-archive/`、`docs/agent/ADR.md`、`docs/agent/INVARIANTS.md`、`docs/agent/designs/`，兼容 `\` 分隔符
- [x] 1.3 在 `handle-context.ts` 的 `isAgingExempt` 中接入 `isArchDocPath`，并移除 `isPlansFilePath` 调用（`.pi/plans/` 不再豁免）
- [x] 1.4 清理不再被引用的 `isPlansFilePath`（若确认无其他调用方则删除函数本体）

## 2. 测试更新（aging-exempt-unit.test.ts）

- [x] 2.1 重写现有豁免清单用例：openspec 收窄至 design.md（正例）；proposal/tasks/增量 specs/主 specs 走普通 aging（反例）
- [x] 2.2 新增 `.pi/plans/` 不豁免用例
- [x] 2.3 新增架构宪法豁免用例：adr/INDEX、编号 ADR、adr-archive、单文件 ADR.md、INVARIANTS.md、designs/
- [x] 2.4 新增误伤防护反例：`results/designs/x.md`、`docs/ADR.md`、项目根 `ADR.md`、agent 目录外 `skills/` 均不豁免
- [x] 2.5 保留并确认"豁免仅对 read 生效"用例（bash/grep 命中豁免路径不豁免）

## 3. 验证与收尾

- [x] 3.1 `npm test` 全绿（vitest run）
- [x] 3.2 `npm run typecheck` 通过
- [x] 3.3 手工冒烟：构造 read `docs/agent/INVARIANTS.md` 与 read `.pi/plans/x.md` 的 context 事件，确认前者不计数、后者正常累加
- [x] 3.4 更新记忆文件 `aging-exempt-semantics`（全局记忆）反映新豁免清单
