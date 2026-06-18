/**
 * resume manifest 恢复测试 — 确保 resume 冷启动时 manifest 正确恢复
 *
 * 根因：resume 冷启动后扩展重新加载，state.sessionId=""。
 * 第一次 context 事件时如果 getSessionId() 返回 undefined（加载早期），
 * loadManifest 不执行 → agingDeletedIds 为空 → 被删除的大结果全部恢复进上下文 → 爆炸。
 *
 * 修复：getSessionId() 返回 falsy 时用 process.env.PI_SESSION_ID 作为 fallback。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type ContextState, handleContextEvent } from "../handle-context.js";
import { loadManifest } from "../shared.js";

// ── mocks ──
vi.mock("../shared.js", () => ({
	getContextConfig: () => ({
		distillThreshold: 100,
		agingThreshold: 10,
		errorAgingThreshold: 3,
		largeResultAging: 2,
		processorThreshold: 0,
		firstSeenCap: 15000,
	}),
	distilledMap: new Map(),
	readCachedMessages: () => [],
	writeCachedMessages: vi.fn(),
	saveManifest: vi.fn(),
	loadManifest: vi.fn(),
	hintsConfig: {
		distillWarning: "📋 {label}",
		distillWarningShort: "📋 {label}",
		distillOverCapWarning: "⚠️ {label}",
		distillOverCapWarningShort: "⚠️ {label}",
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
	removeOrphanedToolCalls: vi.fn(),
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
	return { events: { emit: vi.fn() } } as unknown as ExtensionAPI;
}
function mkMsg(tcId: string, text: string): any[] {
	return [
		{
			role: "assistant",
			content: [{ type: "toolCall", id: tcId, name: "bash", arguments: {} }],
		},
		{
			role: "toolResult",
			toolCallId: tcId,
			toolName: "bash",
			content: [{ type: "text", text }],
			isError: false,
		},
	];
}
function remaining(msgs: any[]): string[] {
	return msgs
		.filter((m: any) => m.role === "toolResult")
		.map((m: any) => m.toolCallId);
}

// ═══════════════════════════════════════════
describe("resume manifest 恢复", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.PI_SESSION_ID;
	});

	it("getSessionId 正常时用其值恢复 manifest", () => {
		const state = mkState();
		const pi = mkPi();
		const ctx = {
			sessionManager: { getSessionId: () => "ctx-session-id" },
		};

		handleContextEvent({ messages: [] }, ctx, state, pi);

		expect(loadManifest).toHaveBeenCalledWith(
			"ctx-session-id",
			expect.any(Object),
		);
		expect(state.sessionId).toBe("ctx-session-id");
	});

	it("getSessionId 返回 undefined 时用 PI_SESSION_ID fallback 恢复 manifest", () => {
		process.env.PI_SESSION_ID = "env-session-id";
		const state = mkState();
		const pi = mkPi();
		// 模拟 resume 冷启动早期：getSessionId 返回 undefined
		const ctx = {
			sessionManager: { getSessionId: () => undefined },
		};

		handleContextEvent({ messages: [] }, ctx, state, pi);

		// 应该用 env fallback 加载 manifest
		expect(loadManifest).toHaveBeenCalledWith(
			"env-session-id",
			expect.any(Object),
		);
		expect(state.sessionId).toBe("env-session-id");
	});

	it("env fallback 恢复的 agingDeleted 被正确应用 — 大结果不进入上下文", () => {
		process.env.PI_SESSION_ID = "env-session-id";
		const state = mkState();
		const pi = mkPi();
		const ctx = {
			sessionManager: { getSessionId: () => undefined },
		};

		// 模拟 manifest 中有 2 个已删除的 tcId
		vi.mocked(loadManifest).mockImplementation((_sid: string, opts: any) => {
			opts.agingDeleted.add("tc-deleted-1");
			opts.agingDeleted.add("tc-deleted-2");
		});

		const msgs = [
			...mkMsg("tc-deleted-1", "old large result"),
			...mkMsg("tc-deleted-2", "another old result"),
			...mkMsg("tc-active", "current result"),
		];

		handleContextEvent({ messages: msgs }, ctx, state, pi);

		// 被删除的不进入上下文，只有 tc-active 保留
		expect(remaining(msgs)).toEqual(["tc-active"]);
	});

	it("getSessionId 和 PI_SESSION_ID 都为空时不加载 manifest", () => {
		const state = mkState();
		const pi = mkPi();
		const ctx = {
			sessionManager: { getSessionId: () => undefined },
		};

		handleContextEvent({ messages: [] }, ctx, state, pi);

		expect(loadManifest).not.toHaveBeenCalled();
	});

	it("同一 session 第二次 context 事件不重复加载 manifest", () => {
		process.env.PI_SESSION_ID = "env-session-id";
		const state = mkState();
		const pi = mkPi();
		const ctx = {
			sessionManager: { getSessionId: () => undefined },
		};

		// 第一次：触发 loadManifest
		handleContextEvent({ messages: [] }, ctx, state, pi);
		expect(loadManifest).toHaveBeenCalledTimes(1);

		// 第二次：sessionId 已设为 env-session-id，不重复加载
		handleContextEvent({ messages: [] }, ctx, state, pi);
		expect(loadManifest).toHaveBeenCalledTimes(1);
	});
});
