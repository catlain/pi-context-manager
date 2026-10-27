## 1. 实现改动

- [x] 1.1 删除 `distill-helpers.ts` 中 `selectAgingThreshold` 的 edit/write 非错误 → `Number.POSITIVE_INFINITY` 分支（整段移除，控制流自然落入普通路径返回 `cfg.agingThreshold`）
- [x] 1.2 核对 `shared.ts` 中 `AgingConfig` 及相关注释，移除 edit/write 豁免表述（核对结果：shared.ts 无豁免表述，无需改动；AgingConfig 注释已在 1.1 同步）

## 2. 测试反转与新增

- [x] 2.1 反转 `tests/select-aging-threshold-unit.test.ts`：L33/L39 "edit/write 非错误 → Infinity" 改为 → agingThreshold；L110 "edit 非错误优先级高于大文件" 改为 edit 非错误大文件 → largeResultAging（优先级 A 恢复对成功 edit 生效）；L82 注释同步
- [x] 2.2 改写 `tests/edit-write-aging-exempt.test.ts`：原“edit 非错误 → Infinity，2 轮不删”类断言反转为“agingThreshold 轮后删除”；文件语义从“豁免验证”转为“统一阈值验证”（重命名为 edit-write-aging-unified.test.ts，旧文件已 git rm）
- [x] 2.3 核对 `tests/edit-write-first-seen-cap.test.ts`：firstSeenCap 行为不变（大结果首现即删仍生效），头注释 “Infinity aging 阈值” 表述已修正；另同步 aging-exempt-regression.test.ts 中的旧文件名引用
- [x] 2.4 新增存量衔接用例：模拟 manifest 持久化计数 516 的 edit 结果，resume 后下一轮 context 事件即删（≥ agingThreshold）
- [x] 2.5 回归 `tests/error-aging.test.ts` 与 aging-test-helpers 相关套件（aging 定向 33/33 绿）

## 3. 验证与文档

- [x] 3.1 运行 `npm test` 全绿（67 文件/824 用例）+ `npm run typecheck` 通过
- [ ] 3.2 更新全局记忆 `aging-exempt-semantics`：移除 "Infinity 阈值豁免（edit/write）" 层次，记录本变更的取代关系与统一阈值语义
- [ ] 3.3 git commit（含 session 追踪注释）
