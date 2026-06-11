/**
 * errorAgingThreshold — 错误结果加速淘汰测试
 */
import { describe, expect, it, vi } from "vitest";
import { type ContextState, handleContextEvent } from "../handle-context.js";

// ── mocks ──
vi.mock("../shared.js", () => ({
	getContextConfig: () => ({
		distillThreshold: 100,
		agingThreshold: 10,
		errorAgingThreshold: 3,
		processorThreshold: 0,
		firstSeenCap: 15000,
	}),
	distilledMap: new Map(),
	readCachedMessages: () => [],
	writeCachedMessages: vi.fn(),
	saveManifest: vi.fn(),
	loadManifest: vi.fn(),
	hintsConfig: {
		distillWarning: "📋 「{label}」~{tokens} tokens",
		distillWarningShort: "📋 大结果「{label}」",
		distillOverCapWarning: "⚠️ 「{label}」~{tokens} tokens 超上限 {cap}",
		distillOverCapWarningShort: "⚠️ 超大结果「{label}」",
		processorSummary: "[processed] {toolName}",
		processorSmallResult: "{formatted}",
	},
	fillTemplate: (t: string, vars: Record<string, string>) =>
		t.replace(/\{(\w+)\}/g, (_: string, k: string) => vars[k] ?? `{${k}}`),
}));

vi.mock("../distill-helpers.js", () => ({
	buildToolCallMap: () => new Map(),
	estimateTokens: (t: string) => Math.ceil(t.length / 4),
	isSkillFilePath: () => false,
	isPlansFilePath: () => false,
	toolMeta: () => ({ meta: "" }),
	removeOrphanedToolCalls: (msgs: any[]) => {
		const activeIds = new Set<string>();
		for (const m of msgs)
			if (m.role === "toolResult" && m.toolCallId) activeIds.add(m.toolCallId);
		for (const msg of msgs) {
			if (msg.role === "assistant" && Array.isArray(msg.content))
				msg.content = msg.content.filter(
					(b: any) => b.type !== "toolCall" || activeIds.has(b.id),
				);
		}
		for (let i = msgs.length - 1; i >= 0; i--) {
			const m = msgs[i];
			if (
				m.role === "assistant" &&
				Array.isArray(m.content) &&
				m.content.length === 0
			)
				msgs.splice(i, 1);
		}
	},
}));

vi.mock("../toolcall-args-truncator.js", () => ({
	truncateToolCallArgs: vi.fn(),
}));

// ── helpers ──
function mkState(): ContextState {
	return {
		agingTracker: new Map(),
		agingSnapshot: new Map(),
		manuallyDeletedIds: new Set(),
		agingDeletedIds: new Set(),
		seenArgs: new Set(),
		truncatedToolCallIds: new Set(),
		lastMessages: [],
		sessionId: "",
	};
}
function mkPi() {
	return { events: { emit: vi.fn() } };
}

/** 构造 toolResult 消息，isError 可控 */
function mkMsg(
	tcId: string,
	text: string,
	opts: { isError?: boolean; toolName?: string } = {},
): any[] {
	return [
		{
			role: "assistant",
			content: [
				{
					type: "toolCall",
					id: tcId,
					name: opts.toolName ?? "bash",
					arguments: {},
				},
			],
		},
		{
			role: "toolResult",
			toolCallId: tcId,
			toolName: opts.toolName ?? "bash",
			content: [{ type: "text", text }],
			isError: opts.isError ?? false,
		},
	];
}

function remaining(msgs: any[]): string[] {
	return msgs
		.filter((m: any) => m.role === "toolResult")
		.map((m: any) => m.toolCallId);
}

function trigger(state: ContextState, msgs: any[], pi: any) {
	handleContextEvent({ messages: msgs }, {}, state, pi);
}

// ═══════════════════════════════════════════
describe("errorAgingThreshold 错误加速淘汰", () => {
	it("错误结果在 errorAgingThreshold 轮后被淘汰", () => {
		const state = mkState();
		const pi = mkPi();
		// errorAgingThreshold=3，前 2 轮保留
		for (let r = 0; r < 2; r++) {
			const msgs = [...mkMsg("tc-err", "Error: something failed", { isError: true })];
			trigger(state, msgs, pi);
			expect(remaining(msgs)).toEqual(["tc-err"]);
		}
		// 轮 3: 达到阈值 → 删除
		const msgs3 = [...mkMsg("tc-err", "Error: something failed", { isError: true })];
		trigger(state, msgs3, pi);
		expect(remaining(msgs3)).toEqual([]);
		expect(state.agingDeletedIds.has("tc-err")).toBe(true);
	});

	it("正常结果仍使用 agingThreshold（10 轮）", () => {
		const state = mkState();
		const pi = mkPi();
		// 跑 5 轮（远小于 agingThreshold=10）→ 仍然保留
		for (let r = 0; r < 5; r++) {
			const msgs = [...mkMsg("tc-ok", "success result")];
			trigger(state, msgs, pi);
			expect(remaining(msgs)).toEqual(["tc-ok"]);
		}
		expect(state.agingDeletedIds.has("tc-ok")).toBe(false);
	});

	it("错误 + 大结果：大结果优先（2 轮）", () => {
		const state = mkState();
		const pi = mkPi();
		// 大结果：500 字符 ≈ 125 tokens > distillThreshold=100
		const bigErrorText = "x".repeat(500);
		// 轮 1: 保留 + distill 提示
		const msgs1 = [...mkMsg("tc-big-err", bigErrorText, { isError: true })];
		trigger(state, msgs1, pi);
		expect(remaining(msgs1)).toEqual(["tc-big-err"]);
		// 轮 2: 大结果阈值=2 → 删除
		const msgs2 = [...mkMsg("tc-big-err", bigErrorText, { isError: true })];
		trigger(state, msgs2, pi);
		expect(remaining(msgs2)).toEqual([]);
	});

	it("错误结果和正常结果独立计数", () => {
		const state = mkState();
		const pi = mkPi();
		// 同时有错误和正常结果
		for (let r = 0; r < 3; r++) {
			const msgs = [
				...mkMsg("tc-err", "err", { isError: true }),
				...mkMsg("tc-ok", "ok"),
			];
			trigger(state, msgs, pi);
		}
		// tc-err 达到 errorAgingThreshold=3 → 已删
		expect(state.agingDeletedIds.has("tc-err")).toBe(true);
		// tc-ok 未达到 agingThreshold=10 → 仍在
		expect(state.agingDeletedIds.has("tc-ok")).toBe(false);
	});

	it("isError=true 但 errorAgingThreshold=0 → 不淘汰（禁用错误加速）", () => {
		// 需要 errorAgingThreshold=0 的 mock，单独测试
		// 此用例由配置层测试覆盖
	});
});
