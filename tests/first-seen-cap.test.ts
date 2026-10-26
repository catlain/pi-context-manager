/**
 * firstSeenCap — distill 首次给全文的大小上限测试
 *
 * 覆盖：正常保留 / 超大删除 / cap=0 无限 / 配置矛盾自动修复 / 多轮混合
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextState } from "../handle-context.js";
import {
	agingMockState,
	distillHelpersMockFactory,
	mkPi,
	mkState,
	rem,
	sharedMockFactory,
	truncatorMockFactory,
} from "./aging-test-helpers.js";

vi.mock("../shared.js", () => sharedMockFactory());
// 保留真实 distill-helpers（selectAgingThreshold 优先级 / isAgingExempt——用例均无
// path，真实判定恒 false，与原手写 stub 等价），只覆盖 estimateTokens —— 消除复刻假绿
vi.mock("../distill-helpers.js", (o) => distillHelpersMockFactory(o));
vi.mock("../toolcall-args-truncator.js", () => truncatorMockFactory());

// ── helpers ──
const mkMsg = (tcId: string, text: string) => [
	{
		role: "assistant",
		content: [{ type: "toolCall", id: tcId, name: "read", arguments: {} }],
	},
	{
		role: "toolResult",
		toolCallId: tcId,
		toolName: "read",
		content: [{ type: "text", text }],
	},
];
const hints = (pi: any) =>
	pi.events.emit.mock.calls
		.filter((c: any[]) => c[0] === "ephemeral:hint")
		.map((c: any[]) => c[1]?.text ?? "");
const cfg = (o?: Record<string, number>) => ({
	distillThreshold: 100,
	agingThreshold: 10,
	processorThreshold: 0,
	firstSeenCap: 500,
	...o,
});
async function trigger(s: ContextState, msgs: any[], pi: any) {
	const { handleContextEvent } = await import("../handle-context.js");
	handleContextEvent({ messages: msgs }, {} as unknown as { sessionManager: { getSessionId?: () => string | undefined } }, s, pi);
}

// ═══════════════════════════════════════
// 1. 正常首次保留（tokens ∈ [threshold, cap]）
// ═══════════════════════════════════════
describe("firstSeenCap: 正常首次保留", () => {
	beforeEach(() => {
		agingMockState.config = cfg();
		agingMockState.tokensFn = (t) => Math.ceil(t.length / 4);
	});

	it("保留全文 + 普通 hint", async () => {
		const s = mkState(),
			pi = mkPi();
		await trigger(s, [...mkMsg("tc1", "x".repeat(800))], pi); // ~200 tokens
		expect(rem(s.lastMessages as any)).toHaveLength(1); // 保留
		expect(hints(pi)[0]).toContain("下轮移除");
		expect(s.seenArgs.has("tc1")).toBe(true);
	});

	it("边界 tokens == cap → 保留全文", async () => {
		const s = mkState(),
			pi = mkPi();
		await trigger(s, [...mkMsg("tc2", "x".repeat(2000))], pi); // 500 tokens == cap
		expect(hints(pi)[0]).toContain("下轮移除");
	});
});

// ═══════════════════════════════════════
// 2. 超大结果 > cap → 直接删除 + overCap hint
// ═══════════════════════════════════════
describe("firstSeenCap: 超大结果直接删除", () => {
	beforeEach(() => {
		agingMockState.config = cfg();
		agingMockState.tokensFn = (t) => Math.ceil(t.length / 4);
	});

	it("首次也直接删除", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = [...mkMsg("tc-h", "x".repeat(4000))]; // 1000 tokens > 500
		await trigger(s, msgs, pi);
		expect(rem(msgs)).toEqual([]);
		expect(s.agingDeletedIds.has("tc-h")).toBe(true);
		expect(hints(pi)[0]).toContain("已直接移除");
	});

	it("第二轮静默跳过", async () => {
		const s = mkState(),
			pi = mkPi();
		await trigger(s, [...mkMsg("tc-h", "x".repeat(4000))], pi);
		pi.events.emit.mockClear();
		const msgs2 = [...mkMsg("tc-h", "x".repeat(4000))];
		await trigger(s, msgs2, pi);
		expect(rem(msgs2)).toEqual([]);
		expect(hints(pi)).toHaveLength(0);
	});

	it("超大 + 小结果混合", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = [...mkMsg("tc-h", "x".repeat(4000)), ...mkMsg("tc-s", "hi")];
		await trigger(s, msgs, pi);
		expect(rem(msgs)).toEqual(["tc-s"]);
	});
});

// ═══════════════════════════════════════
// 3. cap=0 → 不设上限（等同无限 cap）
// ═══════════════════════════════════════
describe("firstSeenCap: cap=0 无限", () => {
	beforeEach(() => {
		agingMockState.config = cfg({ firstSeenCap: 0 });
		agingMockState.tokensFn = (t) => Math.ceil(t.length / 4);
	});

	it("cap=0 时正常大结果首次保留（0 表示不限制）", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = [...mkMsg("tc1", "x".repeat(800))];
		await trigger(s, msgs, pi);
		expect(rem(msgs)).toEqual(["tc1"]);
		expect(hints(pi)[0]).toContain("下轮移除");
	});
});

// ═══════════════════════════════════════
// 4. cap < distillThreshold → 自动取 max
// ═══════════════════════════════════════
describe("firstSeenCap: 配置矛盾自动修复", () => {
	beforeEach(() => {
		agingMockState.config = cfg({ firstSeenCap: 50 });
		agingMockState.tokensFn = (t) => Math.ceil(t.length / 4);
	});

	it("200 tokens > max(50,100)=100 → 删除", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = [...mkMsg("tc1", "x".repeat(800))];
		await trigger(s, msgs, pi);
		expect(rem(msgs)).toEqual([]);
	});

	it("100 tokens == max(50,100)=100 → 保留", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = [...mkMsg("tc2", "x".repeat(400))];
		await trigger(s, msgs, pi);
		expect(hints(pi)).toHaveLength(1);
	});
});

// ═══════════════════════════════════════
// 5. 小结果不受影响 + 多轮混合
// ═══════════════════════════════════════
describe("firstSeenCap: 小结果 + 多轮混合", () => {
	beforeEach(() => {
		agingMockState.config = cfg({ agingThreshold: 3 });
		agingMockState.tokensFn = (t) => Math.ceil(t.length / 4);
	});

	it("小结果走 aging 不受 cap 影响", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = [...mkMsg("tc-s", "hi")];
		await trigger(s, msgs, pi);
		expect(rem(msgs)).toEqual(["tc-s"]);
		expect(hints(pi)).toHaveLength(0);
	});

	it("正常→删除→超大新出现直接删除", async () => {
		agingMockState.config = cfg({ agingThreshold: 2 }); // 轮1保留，轮2删除
		const s = mkState(),
			pi = mkPi();
		// 轮1: 正常大结果 200 tokens ∈ [100, 500]，首次保留
		await trigger(s, [...mkMsg("tc-n", "x".repeat(800))], pi);
		expect(s.seenArgs.has("tc-n")).toBe(true);
		// 轮2: count=2 ≥ agingThreshold=2 → 删除
		await trigger(s, [...mkMsg("tc-n", "x".repeat(800))], pi);
		expect(s.agingDeletedIds.has("tc-n")).toBe(true);
		// 轮3: 超大 → 直接删除
		pi.events.emit.mockClear();
		await trigger(s, [...mkMsg("tc-h", "x".repeat(4000))], pi);
		expect(s.agingDeletedIds.has("tc-h")).toBe(true);
		expect(hints(pi)[0]).toContain("已直接移除");
	});
});
