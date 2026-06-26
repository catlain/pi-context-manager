/**
 * edit/write aging 豁免集成测试
 *
 * 覆盖 spec 的全部场景：
 * - edit/write 成功结果永不因轮数/大文件淘汰
 * - edit/write 错误结果走 errorAgingThreshold
 * - edit/write 仍受 firstSeenCap 兜底
 * - 混合场景 + 回归（skill/plans 不变）
 *
 * 参照 skill-file-aging-exempt.test.ts 的 mock 模式。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextState } from "../handle-context.js";

// ── Mocks ──
let mockConfig: Record<string, number>;
let mockEstimateTokens: (t: string) => number;

vi.mock("@earendil-works/pi-coding-agent", () => ({
	registerExtension: vi.fn(),
	registerCommand: vi.fn(),
	registerTool: vi.fn(),
}));

vi.mock("../shared.js", () => ({
	getContextConfig: () => mockConfig,
	distilledMap: new Map(),
	readCachedMessages: () => [],
	writeCachedMessages: vi.fn(),
	saveManifest: vi.fn(),
	loadManifest: vi.fn(),
	hintsConfig: {
		distillWarning: "📋 「{label}」~{tokens} tokens，下轮移除。",
		distillWarningShort: "📋 「{label}」下轮移除",
		distillOverCapWarning: "⚠️ 「{label}」~{tokens} > {cap}，已直接移除。",
		distillOverCapWarningShort: "⚠️ 「{label}」已移除",
		processorSummary: "",
		processorSmallResult: "",
	},
	fillTemplate: (t: string, v: Record<string, string>) =>
		t.replace(/\{(\w+)\}/g, (_: string, k: string) => v[k] ?? `{${k}}`),
}));

// 保留真实 distill-helpers（含 isAgingExempt/selectAgingThreshold/isSkillFilePath），
// 只覆盖 estimateTokens 以控制 token 判断
vi.mock("../distill-helpers.js", async (orig) => ({
	...(await orig<typeof import("../distill-helpers.js")>()),
	estimateTokens: (t: string) => mockEstimateTokens(t),
}));

vi.mock("../toolcall-args-truncator.js", () => ({
	truncateToolCallArgs: vi.fn(),
}));

// ── Helpers ──
const AGENT_DIR =
	process.env.PI_AGENT_DIR ||
	require("node:path").join(process.env.HOME || "/root", ".pi", "agent");

const mkState = (): ContextState => ({
	agingTracker: new Map(),
	agingSnapshot: new Map(),
	manuallyDeletedIds: new Set(),
	agingDeletedIds: new Set(),
	seenArgs: new Set(),
	truncatedToolCallIds: new Set(),
	lastMessages: [],
	sessionId: "",
});
const mkPi = () => ({ events: { emit: vi.fn() } });

/** 构造 toolCall + toolResult 消息对 */
const mkMsg = (
	tcId: string,
	toolName: string,
	args: Record<string, unknown>,
	text: string,
	opts: { isError?: boolean } = {},
): any[] => [
	{
		role: "assistant",
		content: [
			{ type: "toolCall", id: tcId, name: toolName, arguments: args },
		],
	},
	{
		role: "toolResult",
		toolCallId: tcId,
		toolName,
		content: [{ type: "text", text }],
		isError: opts.isError ?? false,
	},
];
const rem = (msgs: any[]) =>
	msgs
		.filter((m: any) => m.role === "toolResult")
		.map((m: any) => m.toolCallId);
const hints = (pi: any) =>
	pi.events.emit.mock.calls
		.filter((c: any[]) => c[0] === "ephemeral:hint")
		.map((c: any[]) => c[1]?.text ?? "");

async function trigger(s: ContextState, msgs: any[], pi: any) {
	const { handleContextEvent } = await import("../handle-context.js");
	handleContextEvent(
		{ messages: msgs },
		{} as unknown as { sessionManager: { getSessionId?: () => string | undefined } },
		s,
		pi,
	);
}

// ════════════════════════════════════════
// edit/write 成功结果豁免轮数 aging (C)
// ════════════════════════════════════════
describe("edit/write 成功结果豁免轮数 aging", () => {
	beforeEach(() => {
		mockConfig = {
			distillThreshold: 1000,
			agingThreshold: 3,
			errorAgingThreshold: 3,
			largeResultAging: 2,
			processorThreshold: 0,
			firstSeenCap: 15000,
		};
		mockEstimateTokens = (t) => Math.ceil(t.length / 4);
	});

	it("edit 成功结果跑 >agingThreshold 轮仍保留", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = mkMsg("e1", "edit", { path: "/x/a.ts" }, "已编辑");
		for (let i = 0; i < 6; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).toContain("e1");
		expect(s.agingDeletedIds.has("e1")).toBe(false);
	});

	it("write 成功结果跑 >agingThreshold 轮仍保留", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = mkMsg("w1", "write", { path: "/x/b.ts" }, "已写入");
		for (let i = 0; i < 6; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).toContain("w1");
		expect(s.agingDeletedIds.has("w1")).toBe(false);
	});

	it("混合：edit 保留 + bash 正常淘汰", async () => {
		const s = mkState(),
			pi = mkPi();
		const editMsg = mkMsg("e2", "edit", { path: "/x/a.ts" }, "已编辑");
		const bashMsg = mkMsg("b2", "bash", { command: "ls" }, "output");
		for (let i = 0; i < 4; i++)
			await trigger(s, [...editMsg, ...bashMsg], pi);
		const remaining = rem(s.lastMessages);
		expect(remaining).toContain("e2");
		expect(remaining).not.toContain("b2");
	});

	it("混合：write 保留 + read 正常淘汰", async () => {
		const s = mkState(),
			pi = mkPi();
		const writeMsg = mkMsg("w2", "write", { path: "/x/c.ts" }, "已写入");
		const readMsg = mkMsg("r2", "read", { path: "/x/d.ts" }, "content");
		for (let i = 0; i < 4; i++)
			await trigger(s, [...writeMsg, ...readMsg], pi);
		const remaining = rem(s.lastMessages);
		expect(remaining).toContain("w2");
		expect(remaining).not.toContain("r2");
	});
});

// ════════════════════════════════════════
// edit/write 成功结果豁免大文件 aging (A)
// ════════════════════════════════════════
describe("edit/write 成功结果豁免大文件 aging", () => {
	beforeEach(() => {
		mockConfig = {
			distillThreshold: 100,
			agingThreshold: 10,
			errorAgingThreshold: 3,
			largeResultAging: 2,
			processorThreshold: 0,
			firstSeenCap: 15000,
		};
		mockEstimateTokens = (t) => Math.ceil(t.length / 4);
	});

	it("edit 成功大文件结果不走 largeResultAging（2轮不删）", async () => {
		const s = mkState(),
			pi = mkPi();
		// 500 字符 = 125 tokens > distillThreshold=100，正常走 largeResultAging=2
		// 但 edit 非错误 → Infinity，2 轮不删
		const bigEdit = mkMsg("e3", "edit", { path: "/x/a.ts" }, "x".repeat(500));
		await trigger(s, [...bigEdit], pi); // 轮1
		await trigger(s, [...bigEdit], pi); // 轮2：largeResultAging=2 会删，但 edit 豁免
		expect(rem(s.lastMessages)).toContain("e3");
		expect(s.agingDeletedIds.has("e3")).toBe(false);
	});
});

// ════════════════════════════════════════
// edit/write 错误结果走 errorAgingThreshold (B)
// ════════════════════════════════════════
describe("edit/write 错误结果走 errorAgingThreshold", () => {
	beforeEach(() => {
		mockConfig = {
			distillThreshold: 1000,
			agingThreshold: 10,
			errorAgingThreshold: 3,
			largeResultAging: 2,
			processorThreshold: 0,
			firstSeenCap: 15000,
		};
		mockEstimateTokens = (t) => Math.ceil(t.length / 4);
	});

	it("edit 错误结果在 errorAgingThreshold 轮后被淘汰", async () => {
		const s = mkState(),
			pi = mkPi();
		const errMsg = mkMsg(
			"e4",
			"edit",
			{ path: "/x/a.ts" },
			"Error: file not found",
			{ isError: true },
		);
		for (let i = 0; i < 2; i++) await trigger(s, [...errMsg], pi);
		expect(rem(s.lastMessages)).toContain("e4"); // 未达 errorAging=3
		await trigger(s, [...errMsg], pi); // 第3轮
		expect(s.agingDeletedIds.has("e4")).toBe(true);
	});

	it("write 错误结果在 errorAgingThreshold 轮后被淘汰", async () => {
		const s = mkState(),
			pi = mkPi();
		const errMsg = mkMsg(
			"w4",
			"write",
			{ path: "/x/b.ts" },
			"Error: permission denied",
			{ isError: true },
		);
		for (let i = 0; i < 3; i++) await trigger(s, [...errMsg], pi);
		expect(s.agingDeletedIds.has("w4")).toBe(true);
	});
});

// ════════════════════════════════════════
// edit/write 仍受 firstSeenCap 兜底
// ════════════════════════════════════════
describe("edit/write 仍受 firstSeenCap 兜底", () => {
	beforeEach(() => {
		mockConfig = {
			distillThreshold: 100,
			agingThreshold: 10,
			errorAgingThreshold: 3,
			largeResultAging: 2,
			processorThreshold: 0,
			firstSeenCap: 500,
		};
		mockEstimateTokens = (t) => Math.ceil(t.length / 4);
	});

	it("edit 成功超大结果（>cap）首次即删除 + overCap hint", async () => {
		const s = mkState(),
			pi = mkPi();
		// effectiveCap = max(500, 100) = 500。4000 字符 = 1000 tokens > 500
		const hugeEdit = mkMsg(
			"e5",
			"edit",
			{ path: "/x/a.ts" },
			"x".repeat(4000),
		);
		await trigger(s, [...hugeEdit], pi);
		expect(rem(s.lastMessages)).not.toContain("e5");
		expect(s.agingDeletedIds.has("e5")).toBe(true);
		expect(hints(pi)[0]).toContain("已直接移除");
	});

	it("edit 成功大结果（∈ [distill, cap]）首次保留 + distill hint", async () => {
		const s = mkState(),
			pi = mkPi();
		// 800 字符 = 200 tokens，∈ [100, 500]
		const bigEdit = mkMsg(
			"e6",
			"edit",
			{ path: "/x/a.ts" },
			"x".repeat(800),
		);
		await trigger(s, [...bigEdit], pi);
		expect(rem(s.lastMessages)).toContain("e6");
		expect(hints(pi)[0]).toContain("下轮移除");
		expect(s.seenArgs.has("e6")).toBe(true);
	});
});

// ════════════════════════════════════════
// 回归：skill/plans 豁免行为不变
// ════════════════════════════════════════
describe("回归：skill/plans 豁免不变", () => {
	beforeEach(() => {
		mockConfig = {
			distillThreshold: 1000,
			agingThreshold: 3,
			errorAgingThreshold: 3,
			largeResultAging: 2,
			processorThreshold: 0,
			firstSeenCap: 15000,
		};
		mockEstimateTokens = (t) => Math.ceil(t.length / 4);
	});

	it("skill 文件仍豁免 aging", async () => {
		const s = mkState(),
			pi = mkPi();
		const skillMsg = mkMsg(
			"sk1",
			"read",
			{ path: `${AGENT_DIR}/skills/code-graph/SKILL.md` },
			"x".repeat(200),
		);
		for (let i = 0; i < 5; i++) await trigger(s, [...skillMsg], pi);
		expect(rem(s.lastMessages)).toContain("sk1");
	});

	it("plans 文件仍豁免 aging", async () => {
		const s = mkState(),
			pi = mkPi();
		const plansMsg = mkMsg(
			"pl1",
			"read",
			{ path: "/project/.pi/plans/E1.md" },
			"x".repeat(200),
		);
		for (let i = 0; i < 5; i++) await trigger(s, [...plansMsg], pi);
		expect(rem(s.lastMessages)).toContain("pl1");
	});
});
