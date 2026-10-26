# Tasks: skill-exempt-followup

> **并行会话冲突说明**：实施中途，另一会话以 `unify-protected-doc-list`（shared-utils 1.2.0
> protected-docs.ts 单一事实源）取代了本 change 的 1.x/3.1 本地方案。本会话已适配新语义，
> 保留 2.x（mock 基座统一）成果。详见 design.md 补记。

## 1. 豁免规则实现（distill-helpers.ts）

- [x] 1.1 ~~isSkillFilePath 本地重构~~ → 被 shared-utils `isSkillMdPath`（任意目录树 skills/{name}/SKILL.md，大小写不敏感）取代；distill-helpers 保留别名 re-export。新语义差异：收窄（技能目录非 SKILL.md 不再豁免）+ 扩齐（.agents/git 包等任意树命中）
- [x] 1.2 ~~三正则加 i 标志~~ → shared-utils 谓词已内置大小写不敏感
- [x] 1.3 ~~改名 isOpenspecDesignPath~~ → shared-utils 命名 `isOpenspecDesignDocPath`，本地别名保持兼容

## 2. 测试重构与用例

- [x] 2.1 项目技能用例：并行会话已适配任意目录树语义（含 .agents/git 包反例）；本会话补充的用例经全量回归验证
- [x] 2.2 大小写异写用例：`SKILL.MD`/`Design.md`/`Invariants.md` 已覆盖（谓词内置 i 标志）
- [x] 2.3 I4：提取 `tests/aging-test-helpers.ts` 共享基座（agingMockState + sharedMockFactory/distillHelpersMockFactory/mkState/mkMsg/rem），迁移 8 个集成测试文件，消除基座复制与 opts.isError/agingWarning 漂移（-929 行）
- [x] 2.4 I7：first-seen-cap/error-aging/handle-context-aging/handle-context-manifest/resume-manifest 五个全量 mock 全部改真实 distill-helpers + 只 override estimateTokens（消除手写优先级复刻的假绿风险）；静态 import 型文件 helper 前置防 TDZ

## 3. 模块拆分与验证收尾

- [x] 3.1 ~~拆 aging-exempt-paths.ts~~ → 被更彻底的方案取代：豁免谓词上移 shared-utils 单一事实源（消费方含 pi-shepherd），distill-helpers 262 行已回阈值内
- [x] 3.2 `npm test` 全绿：821/821（含并行会话适配后的用例）
- [x] 3.3 `npm run typecheck` 通过
- [x] 3.4 冒烟：项目技能（.pi/skills + .agents 树）、大小写异写、非技能路径三类判定经全量用例验证（单一事实源谓词直测在 shared-utils 侧）
- [x] 3.5 记忆更新：aging-exempt-semantics 反映单一事实源架构与新语义
