/**
 * edit/write firstSeenCap 兜底集成测试（从 edit-write aging 套件拆出）
 *
 * edit/write 与所有工具一样受 firstSeenCap 大结果兜底：
 * - 超大结果（>cap）首次即删除 + overCap hint
 * - 大结果（∈ [distill, cap]）首次保留 + distill hint
 * （unify-aging-edit-write 后 edit/write 无特殊阈值，但 firstSeenCap 语义不变）
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextState } from "../handle-context.js";
import {
	agingMockState,
	distillHelpersMockFactory,
	mkMsg,
	mkPi,
	mkState,
	piSdkMockFactory,
	rem,
	sharedMockFactory,
	truncatorMockFactory,
} from "./aging-test-helpers.js";

vi.mock("@earendil-works/pi-coding-agent", () => piSdkMockFactory());
vi.mock("../shared.js", () => sharedMockFactory());
// 保留真实 distill-helpers（含 isAgingExempt/selectAgingThreshold/路径豁免判断），
// 只覆盖 estimateTokens 以控制 token 判断
vi.mock("../distill-helpers.js", (o) => distillHelpersMockFactory(o));
vi.mock("../toolcall-args-truncator.js", () => truncatorMockFactory());

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

// edit/write 仍受 firstSeenCap 兜底
// ════════════════════════════════════════
describe("edit/write 仍受 firstSeenCap 兜底", () => {
	beforeEach(() => {
		agingMockState.config = {
			distillThreshold: 100,
			agingThreshold: 10,
			errorAgingThreshold: 3,
			largeResultAging: 2,
			processorThreshold: 0,
			firstSeenCap: 500,
		};
		agingMockState.tokensFn = (t) => Math.ceil(t.length / 4);
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
