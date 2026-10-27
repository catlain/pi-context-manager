/**
 * aging 豁免路径回归测试（端到端：trigger → aging 淘汰判定）
 * 覆盖 retune-aging-exemptions 后的清单：skill 豁免、plans/openspec tasks 不再豁免、
 * design.md / ADR / INVARIANTS / Design Note 豁免。mock 模式参照 edit-write-aging-unified.test.ts。
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
vi.mock("../distill-helpers.js", (o) => distillHelpersMockFactory(o));
vi.mock("../toolcall-args-truncator.js", () => truncatorMockFactory());

async function trigger(s: ContextState, msgs: any[], pi: any) {
	const { handleContextEvent } = await import("../handle-context.js");
	handleContextEvent(
		{ messages: msgs },
		{} as unknown as { sessionManager: { getSessionId?: () => string | undefined } },
		s,
		pi,
	);
}

describe("回归：skill 豁免不变，plans/openspec 不再豁免，ADR 豁免", () => {
	beforeEach(() => {
		agingMockState.config = {
			distillThreshold: 1000,
			agingThreshold: 3,
			errorAgingThreshold: 3,
			largeResultAging: 2,
			processorThreshold: 0,
			firstSeenCap: 15000,
		};
		agingMockState.tokensFn = (t) => Math.ceil(t.length / 4);
	});

	it("skill 文件仍豁免 aging", async () => {
		const s = mkState(),
			pi = mkPi();
		const AGENT_DIR =
			process.env.PI_AGENT_DIR ||
			require("node:path").join(process.env.HOME || "/root", ".pi", "agent");
		const skillMsg = mkMsg(
			"sk1",
			"read",
			{ path: `${AGENT_DIR}/skills/code-graph/SKILL.md` },
			"x".repeat(200),
		);
		for (let i = 0; i < 5; i++) await trigger(s, [...skillMsg], pi);
		expect(rem(s.lastMessages)).toContain("sk1");
	});

	it("plans 文件不再豁免 aging（agingThreshold 后被删）", async () => {
		const s = mkState(),
			pi = mkPi();
		const plansMsg = mkMsg(
			"pl1",
			"read",
			{ path: "/project/.pi/plans/E1.md" },
			"x".repeat(200),
		);
		for (let i = 0; i < 5; i++) await trigger(s, [...plansMsg], pi);
		expect(rem(s.lastMessages)).not.toContain("pl1");
		expect(s.agingDeletedIds.has("pl1")).toBe(true);
	});

	it("openspec tasks.md 不再豁免 aging（agingThreshold 后被删）", async () => {
		const s = mkState(),
			pi = mkPi();
		const tasksMsg = mkMsg(
			"tsp1",
			"read",
			{ path: "openspec/changes/foo/tasks.md" },
			"x".repeat(200),
		);
		for (let i = 0; i < 5; i++) await trigger(s, [...tasksMsg], pi);
		expect(rem(s.lastMessages)).not.toContain("tsp1");
		expect(s.agingDeletedIds.has("tsp1")).toBe(true);
	});

	it("openspec design.md 仍豁免 aging", async () => {
		const s = mkState(),
			pi = mkPi();
		const designMsg = mkMsg(
			"dgn1",
			"read",
			{ path: "openspec/changes/foo/design.md" },
			"x".repeat(200),
		);
		for (let i = 0; i < 5; i++) await trigger(s, [...designMsg], pi);
		expect(rem(s.lastMessages)).toContain("dgn1");
	});

	it("ADR 文档豁免 aging（新增宪法文档豁免）", async () => {
		const s = mkState(),
			pi = mkPi();
		const adrMsg = mkMsg(
			"ad1",
			"read",
			{ path: "docs/agent/adr/0390-ic-single-substrate-dual-view.md" },
			"x".repeat(200),
		);
		for (let i = 0; i < 5; i++) await trigger(s, [...adrMsg], pi);
		expect(rem(s.lastMessages)).toContain("ad1");
	});

	it("INVARIANTS / Design Note 豁免 aging", async () => {
		const s = mkState(),
			pi = mkPi();
		const invMsg = mkMsg(
			"inv1",
			"read",
			{ path: "docs/agent/INVARIANTS.md" },
			"x".repeat(200),
		);
		const dnMsg = mkMsg(
			"dn1",
			"read",
			{ path: "docs/agent/designs/回测引擎.md" },
			"y".repeat(200),
		);
		for (let i = 0; i < 5; i++)
			await trigger(s, [...invMsg, ...dnMsg], pi);
		expect(rem(s.lastMessages)).toContain("inv1");
		expect(rem(s.lastMessages)).toContain("dn1");
	});
});
