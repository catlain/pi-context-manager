/**
 * handleContextEvent 集成测试 — aging 基本删除、distill+aging 统一流程、提示文案
 * （manuallyDeletedIds / agingSnapshot 见 handle-context-aging-misc.test.ts）
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
// ⚠ helper 必须在静态 import 被测模块之前（handle-context 加载触发 mock 工厂）
import {
	agingMockState,
	distillHelpersMockFactory,
	mkPi,
	mkState,
	sharedMockFactory,
	truncatorMockFactory,
} from "./aging-test-helpers.js";
import { type ContextState, handleContextEvent } from "../handle-context.js";

vi.mock("../shared.js", () => sharedMockFactory());
// 保留真实 distill-helpers（用例均无 path，isAgingExempt 真实判定恒 false，
// 与原 stub 等价），只覆盖 estimateTokens —— 消除复刻假绿
vi.mock("../distill-helpers.js", (o) => distillHelpersMockFactory(o));
vi.mock("../toolcall-args-truncator.js", () => truncatorMockFactory());

// ── helpers ──
function mkMsg(tcId: string, text: string, toolName = "bash"): any[] {
	return [
		{
			role: "assistant",
			content: [{ type: "toolCall", id: tcId, name: toolName, arguments: {} }],
		},
		{
			role: "toolResult",
			toolCallId: tcId,
			toolName,
			content: [{ type: "text", text }],
		},
	];
}
function remaining(msgs: any[]): string[] {
	return msgs
		.filter((m: any) => m.role === "toolResult")
		.map((m: any) => m.toolCallId);
}
function trigger(state: ContextState, msgs: any[], pi: any, ctx?: any) {
	handleContextEvent({ messages: msgs }, ctx ?? {}, state, pi);
}

// 文件级统一配置（原 mock 为静态内联，此处等价复刻；六个 describe 共用）
beforeEach(() => {
	agingMockState.config = {
		distillThreshold: 100,
		agingThreshold: 3,
		errorAgingThreshold: 3,
		largeResultAging: 2,
		processorThreshold: 0,
	};
	agingMockState.tokensFn = (t) => Math.ceil(t.length / 4);
});

// ═══════════════════════════════════════════
// 1. aging 基本递增和删除
// ═══════════════════════════════════════════
describe("aging 基本流程", () => {
	it("每轮 +1，达到阈值后删除并加入 agingDeletedIds", () => {
		const state = mkState();
		const pi = mkPi();
		// 轮 1-2: 保留
		for (let r = 0; r < 2; r++) {
			const msgs = [...mkMsg("tc-1", "hello")];
			trigger(state, msgs, pi);
			expect(remaining(msgs)).toEqual(["tc-1"]);
		}
		// 轮 3: 达到阈值 → 删除
		const msgs3 = [...mkMsg("tc-1", "hello")];
		trigger(state, msgs3, pi);
		expect(remaining(msgs3)).toEqual([]);
		// 已加入 agingDeletedIds
		expect(state.agingDeletedIds.has("tc-1")).toBe(true);
	});

	it("agingDeletedIds 中已有 tcId → 直接跳过", () => {
		const state = mkState();
		state.agingDeletedIds.add("tc-old");
		const pi = mkPi();
		const msgs = [
			...mkMsg("tc-old", "old data"),
			...mkMsg("tc-new", "new data"),
		];
		trigger(state, msgs, pi);
		expect(remaining(msgs)).toEqual(["tc-new"]);
	});

	it("达到阈值删除后，下一轮即使消息中还有也跳过", () => {
		const state = mkState();
		const pi = mkPi();
		// 跑 3 轮让 tc-1 达到阈值
		for (let r = 0; r < 3; r++) {
			const msgs = [...mkMsg("tc-1", "hello")];
			trigger(state, msgs, pi);
		}
		expect(state.agingDeletedIds.has("tc-1")).toBe(true);
		// 再一轮，消息中还有 tc-1
		const msgs4 = [...mkMsg("tc-1", "hello"), ...mkMsg("tc-2", "world")];
		trigger(state, msgs4, pi);
		expect(remaining(msgs4)).toEqual(["tc-2"]);
	});
});

// ═══════════════════════════════════════════
// 2. distill + aging 统一流程
// ═══════════════════════════════════════════
describe("distill + aging 统一流程", () => {
	it("大结果（≥distillThreshold）effectiveThreshold=2", () => {
		const state = mkState();
		const pi = mkPi();
		// distillThreshold=100 → 500 字符 ≈ 125 tokens → 大结果
		const bigText = "x".repeat(500);
		// 轮 1: 保留 + 提示
		const msgs1 = [...mkMsg("tc-big", bigText)];
		trigger(state, msgs1, pi);
		expect(remaining(msgs1)).toEqual(["tc-big"]);
		// 轮 2: 删除
		const msgs2 = [...mkMsg("tc-big", bigText)];
		trigger(state, msgs2, pi);
		expect(remaining(msgs2)).toEqual([]);
		expect(state.agingDeletedIds.has("tc-big")).toBe(true);
	});

	it("小结果用 agingThreshold（不经过 distill 通道）", () => {
		const state = mkState();
		const pi = mkPi();
		const smallText = "hi"; // ~1 token, 远小于 distillThreshold=100
		// 轮 1-2: 保留
		for (let r = 0; r < 2; r++) {
			const msgs = [...mkMsg("tc-small", smallText)];
			trigger(state, msgs, pi);
			expect(remaining(msgs)).toEqual(["tc-small"]);
		}
		// 轮 3: 达到 agingThreshold=3 → 删除
		const msgs3 = [...mkMsg("tc-small", smallText)];
		trigger(state, msgs3, pi);
		expect(remaining(msgs3)).toEqual([]);
	});

	it("大结果和小结果混合，各自按自己的阈值", () => {
		const state = mkState();
		const pi = mkPi();
		const bigText = "x".repeat(500);
		const smallText = "hi";

		// 轮 1: 两个都在
		const msgs1 = [
			...mkMsg("tc-big", bigText),
			...mkMsg("tc-small", smallText),
		];
		trigger(state, msgs1, pi);
		expect(remaining(msgs1).sort()).toEqual(["tc-big", "tc-small"]);

		// 轮 2: tc-big 达到阈值 2 → 删, tc-small 还在
		const msgs2 = [
			...mkMsg("tc-big", bigText),
			...mkMsg("tc-small", smallText),
		];
		trigger(state, msgs2, pi);
		expect(remaining(msgs2)).toEqual(["tc-small"]);

		// 轮 3: tc-small 达到阈值 3 → 删
		const msgs3 = [...mkMsg("tc-small", smallText)];
		trigger(state, msgs3, pi);
		expect(remaining(msgs3)).toEqual([]);
	});
});

// agingThreshold=0 禁用场景由单元测试覆盖
