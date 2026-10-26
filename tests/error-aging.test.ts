/**
 * errorAgingThreshold — 错误结果加速淘汰测试
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
// ⚠ helper 必须在静态 import 被测模块之前——handle-context 加载时触发 mock 工厂，
//    此时 helper 绑定必须已初始化（工厂内引用其导出）
import {
	agingMockState,
	distillHelpersMockFactory,
	mkMsg,
	mkPi,
	mkState,
	rem,
	sharedMockFactory,
	truncatorMockFactory,
} from "./aging-test-helpers.js";
import { type ContextState, handleContextEvent } from "../handle-context.js";

vi.mock("../shared.js", () => sharedMockFactory());
// 保留真实 distill-helpers（selectAgingThreshold 优先级 / removeOrphanedToolCalls /
// isAgingExempt），只覆盖 estimateTokens —— 消除历史上手写复刻优先级的假绿风险
vi.mock("../distill-helpers.js", (o) => distillHelpersMockFactory(o));
vi.mock("../toolcall-args-truncator.js", () => truncatorMockFactory());

function trigger(state: ContextState, msgs: any[], pi: any) {
	handleContextEvent({ messages: msgs }, {} as any, state, pi);
}

// ═══════════════════════════════════════════
describe("errorAgingThreshold 错误加速淘汰", () => {
	beforeEach(() => {
		agingMockState.config = {
			distillThreshold: 100,
			agingThreshold: 10,
			errorAgingThreshold: 3,
			largeResultAging: 2,
			processorThreshold: 0,
			firstSeenCap: 15000,
		};
		agingMockState.tokensFn = (t) => Math.ceil(t.length / 4);
	});

	it("错误结果在 errorAgingThreshold 轮后被淘汰", () => {
		const state = mkState();
		const pi = mkPi();
		// errorAgingThreshold=3，前 2 轮保留
		for (let r = 0; r < 2; r++) {
			const msgs = [...mkMsg("tc-err", "bash", {}, "Error: something failed", { isError: true })];
			trigger(state, msgs, pi);
			expect(rem(msgs)).toEqual(["tc-err"]);
		}
		// 轮 3: 达到阈值 → 删除
		const msgs3 = [...mkMsg("tc-err", "bash", {}, "Error: something failed", { isError: true })];
		trigger(state, msgs3, pi);
		expect(rem(msgs3)).toEqual([]);
		expect(state.agingDeletedIds.has("tc-err")).toBe(true);
	});

	it("正常结果仍使用 agingThreshold（10 轮）", () => {
		const state = mkState();
		const pi = mkPi();
		// 跑 5 轮（远小于 agingThreshold=10）→ 仍然保留
		for (let r = 0; r < 5; r++) {
			const msgs = [...mkMsg("tc-ok", "bash", {}, "success result")];
			trigger(state, msgs, pi);
			expect(rem(msgs)).toEqual(["tc-ok"]);
		}
		expect(state.agingDeletedIds.has("tc-ok")).toBe(false);
	});

	it("错误 + 大结果：大结果优先（2 轮）", () => {
		const state = mkState();
		const pi = mkPi();
		// 大结果：500 字符 ≈ 125 tokens > distillThreshold=100
		const bigErrorText = "x".repeat(500);
		// 轮 1: 保留 + distill 提示
		const msgs1 = [...mkMsg("tc-big-err", "bash", {}, bigErrorText, { isError: true })];
		trigger(state, msgs1, pi);
		expect(rem(msgs1)).toEqual(["tc-big-err"]);
		// 轮 2: 大结果阈值=2 → 删除
		const msgs2 = [...mkMsg("tc-big-err", "bash", {}, bigErrorText, { isError: true })];
		trigger(state, msgs2, pi);
		expect(rem(msgs2)).toEqual([]);
	});

	it("错误结果和正常结果独立计数", () => {
		const state = mkState();
		const pi = mkPi();
		// 同时有错误和正常结果
		for (let r = 0; r < 3; r++) {
			const msgs = [
				...mkMsg("tc-err", "bash", {}, "err", { isError: true }),
				...mkMsg("tc-ok", "bash", {}, "ok"),
			];
			trigger(state, msgs, pi);
		}
		// tc-err 达到 errorAgingThreshold=3 → 已删
		expect(state.agingDeletedIds.has("tc-err")).toBe(true);
		// tc-ok 未达到 agingThreshold=10 → 仍在
		expect(state.agingDeletedIds.has("tc-ok")).toBe(false);
	});

	it("isError=true 但 errorAgingThreshold=0 → 走普通 agingThreshold（禁用错误加速）", () => {
		agingMockState.config = {
			...agingMockState.config,
			errorAgingThreshold: 0,
			agingThreshold: 3,
		};
		const state = mkState();
		const pi = mkPi();
		// error 结果：errorAging=0 禁用 → 回退到普通 agingThreshold=3
		for (let r = 0; r < 2; r++) {
			const msgs = [
				...mkMsg("tc-err0", "bash", {}, "Error: disabled", { isError: true }),
			];
			trigger(state, msgs, pi);
			expect(rem(msgs)).toEqual(["tc-err0"]);
		}
		const msgs3 = [
			...mkMsg("tc-err0", "bash", {}, "Error: disabled", { isError: true }),
		];
		trigger(state, msgs3, pi);
		expect(rem(msgs3)).toEqual([]);
		expect(state.agingDeletedIds.has("tc-err0")).toBe(true);
	});
});
