# Tasks: skill-exempt-followup

## 1. 豁免规则实现（distill-helpers.ts）

- [ ] 1.1 `isSkillFilePath` 重构：新增项目技能 OR 分支（路径段 `.pi/skills/<name>/`，短路 true）；`startsWith("/") || startsWith("C:")` 改 `isAbsolute(path)`；正则加 `i` 标志；注释文档化"npm 技能由 AGENT_DIR 前缀天然覆盖，无单独匹配"
- [ ] 1.2 I5：`isOpenspecDocPath` / `isArchDocPath` 正则加 `i` 标志
- [ ] 1.3 I6：`isOpenspecDocPath` 改名 `isOpenspecDesignPath`，同步 `isAgingExempt` 调用点与全部测试引用

## 2. 测试重构与用例（依赖 1.x 全部完成）

- [ ] 2.1 新增项目技能用例：绝对/相对/反斜杠路径豁免；`D:/proj/skills/foo/SKILL.md`（无 .pi 前缀）不豁免；非 C 盘绝对路径正确判定
- [ ] 2.2 新增大小写异写用例：`SKILL.MD`、`Design.md`、`Invariants.md` 异写豁免
- [ ] 2.3 I4：提取 `tests/aging-test-helpers.ts` 共享基座（`vi.hoisted` mock 状态 + `mkState/mkMsg/trigger/rem` 纯函数），迁移 6 个集成测试文件（edit-write-aging-exempt / aging-exempt-regression / skill-file-aging-exempt / first-seen-cap / error-aging / handle-context-* / resume-manifest）消除基座复制；顺带消除 `mkMsg` opts.isError 与 `hintsConfig.agingWarning` 的漂移
- [ ] 2.4 I7：5 个全量 mock 文件逐个判定（first-seen-cap / error-aging / handle-context-aging / handle-context-manifest / resume-manifest）：刻意隔离者保留并加"生产逻辑变更需人工同步"警示注释；无意复刻者改 `importOriginal` 部分 mock（保真实 distill-helpers，只 override 需要的）

## 3. 模块拆分与验证收尾（依赖 2.3 完成）

- [ ] 3.1 D6：路径豁免判断组（`isSkillFilePath` / `isOpenspecDesignPath` / `isArchDocPath` / `isAgingExempt` 及正则/AGENT_DIR 常量）拆到 `aging-exempt-paths.ts`，`distill-helpers.ts` re-export 保持外部兼容；验证 `distill-helpers.ts` 行数回到阈值内
- [ ] 3.2 `npm test` 全绿（全量回归）
- [ ] 3.3 `npm run typecheck` 通过
- [ ] 3.4 冒烟：构造 read `D:/proj/.pi/skills/x/SKILL.md`、read `.pi/skills/x/SKILL.MD`、read `D:/proj/skills/x/SKILL.md` 三类 context 事件验证豁免判定
- [ ] 3.5 更新记忆 `aging-exempt-semantics`：新增项目技能豁免与大小写不敏感语义；清除 I4-I7 挂账记录
