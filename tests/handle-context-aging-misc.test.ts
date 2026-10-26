/**
 * handleContextEvent 集成测试（杂项）— distill 首次提示文案 / manuallyDeletedIds / agingSnapshot
 * （aging 基本删除、distill+aging 统一流程见 handle-context-aging.test.ts）
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
vi.mock("../distill-helpers.js", (o) => distillHelpersMockFactory(o));
vi.mock("../toolcall-args-truncator.js", () => truncatorMockFactory());

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
function trigger(state: ContextState, msgs: any[], pi: any) {
	handleContextEvent(
		{ messages: msgs },
		{} as unknown as {
			sessionManager: { getSessionId?: () => string | undefined };
		},
		state,
		pi,
	);
}

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
// 3. distill 首次提示文案
// ═══════════════════════════════════════════
describe("distill 首次提示", () => {
	it("大结果 count=1 时给提示告诉 AI 用精确方法", () => {
		const state = mkState();
		const pi = mkPi();
		const bigText = "x".repeat(500);
		const msgs = [...mkMsg("tc-big", bigText)];
		trigger(state, msgs, pi);
		// 检查 pi.events.emit 被调用的提示
		const calls = pi.events.emit.mock.calls.map((c: any[]) => c[0]);
		expect(calls).toContain("ephemeral:hint");
	});

	it("大结果 count=2 删除时静默（不给提示）", () => {
		const state = mkState();
		const pi = mkPi();
		const bigText = "x".repeat(500);
		// 轮 1
		trigger(state, [...mkMsg("tc-big", bigText)], pi);
		pi.events.emit.mockClear();
		// 轮 2: 删除
		trigger(state, [...mkMsg("tc-big", bigText)], pi);
		const calls = pi.events.emit.mock.calls.map((c: any[]) => c[0]);
		expect(calls).not.toContain("ephemeral:hint");
	});

	it("小结果不给 distill 提示", () => {
		const state = mkState();
		const pi = mkPi();
		const msgs = [...mkMsg("tc-small", "hi")];
		trigger(state, msgs, pi);
		const calls = pi.events.emit.mock.calls.map((c: any[]) => c[0]);
		expect(calls).not.toContain("ephemeral:hint");
	});
});

// ═══════════════════════════════════════
// manuallyDeletedIds（补回：并行提交 89f1de5 覆盖时丢失的用例）
// ═══════════════════════════════════════
describe("manuallyDeletedIds", () => {
	it("手动删除的 tcId 不再出现", () => {
		const state = mkState();
		state.manuallyDeletedIds.add("tc-del");
		const pi = mkPi();
		const msgs = [...mkMsg("tc-del", "data"), ...mkMsg("tc-keep", "data")];
		trigger(state, msgs, pi);
		expect(remaining(msgs)).toEqual(["tc-keep"]);
	});
});

// ═══════════════════════════════════════
// agingSnapshot（补回：并行提交 89f1de5 覆盖时丢失的用例）
// ═══════════════════════════════════════
describe("agingSnapshot", () => {
	it("每轮更新 agingSnapshot 反映当前计数", () => {
		const state = mkState();
		const pi = mkPi();
		trigger(state, [...mkMsg("tc-1", "hi")], pi);
		expect(state.agingSnapshot.get("tc-1")).toBe(1);
		trigger(state, [...mkMsg("tc-1", "hi")], pi);
		expect(state.agingSnapshot.get("tc-1")).toBe(2);
	});
});
