/**
 * aging 技能文件豁免测试
 *
 * 覆盖：内联技能 / npm 技能 / 参考文件 / 非技能文件 / 非 read 工具 / path 缺失 / 混合场景
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextState } from "../handle-context.js";
import {
	agingMockState,
	distillHelpersMockFactory,
	mkPi,
	mkState,
	piSdkMockFactory,
	rem,
	sharedMockFactory,
	truncatorMockFactory,
} from "./aging-test-helpers.js";

vi.mock("@earendil-works/pi-coding-agent", () => piSdkMockFactory());
vi.mock("../shared.js", () => sharedMockFactory());
// 保留真实 distill-helpers（含 isSkillFilePath 三类匹配），只覆盖 estimateTokens 固定 500（< distillThreshold → 走 aging 路径）
vi.mock("../distill-helpers.js", (o) => distillHelpersMockFactory(o));
vi.mock("../toolcall-args-truncator.js", () => truncatorMockFactory());

const AGENT_DIR =
	process.env.PI_AGENT_DIR ||
	require("node:path").join(process.env.HOME || "/root", ".pi", "agent");

const mkReadMsg = (tcId: string, path: string, text: string) => [
	{
		role: "assistant",
		content: [
			{ type: "toolCall", id: tcId, name: "read", arguments: { path } },
		],
	},
	{
		role: "toolResult",
		toolCallId: tcId,
		toolName: "read",
		content: [{ type: "text", text }],
	},
];
const mkToolMsg = (tcId: string, toolName: string, args: any, text: string) => [
	{
		role: "assistant",
		content: [{ type: "toolCall", id: tcId, name: toolName, arguments: args }],
	},
	{
		role: "toolResult",
		toolCallId: tcId,
		toolName,
		content: [{ type: "text", text }],
	},
];

async function trigger(s: ContextState, msgs: any[], pi: any) {
	const { handleContextEvent } = await import("../handle-context.js");
	handleContextEvent({ messages: msgs }, {} as unknown as { sessionManager: { getSessionId?: () => string | undefined } }, s, pi);
}

// ── Tests ──
describe("aging 技能文件豁免", () => {
	beforeEach(() => {
		agingMockState.config = {
			distillThreshold: 1000,
			agingThreshold: 3,
			processorThreshold: 0,
			firstSeenCap: 15000,
		};
		agingMockState.tokensFn = () => 500;
	});

	it("内联技能 SKILL.md 豁免 aging", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = mkReadMsg(
			"s1",
			`${AGENT_DIR}/skills/code-graph/SKILL.md`,
			"x".repeat(200),
		);
		for (let i = 0; i < 5; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).toContain("s1");
	});

	it("内联技能参考文件（references/*.md）不再豁免（收窄：仅 SKILL.md 入口）", async () => {
		// unify-protected-doc-list 行为变化：技能目录下非 SKILL.md 文件（模板/references 等）
		// 走普通 aging（SKILL.md 入口常在，需要时重读）；agingThreshold=3，5 轮后应被淘汰
		const s = mkState(),
			pi = mkPi();
		const msgs = mkReadMsg(
			"s2",
			`${AGENT_DIR}/skills/frontend-test/references/echarts-events.md`,
			"x".repeat(200),
		);
		for (let i = 0; i < 5; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).not.toContain("s2");
	});

	it("npm 技能文件豁免", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = mkReadMsg(
			"s3",
			`${AGENT_DIR}/npm/node_modules/pi-agent-codebase-workflows/skills/safe-change/SKILL.md`,
			"x".repeat(200),
		);
		for (let i = 0; i < 5; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).toContain("s3");
	});

	it("非技能文件正常 aging 删除", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = mkReadMsg(
			"n1",
			"/home/lain/project/src/index.ts",
			"x".repeat(200),
		);
		for (let i = 0; i < 4; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).not.toContain("n1");
	});

	it("非 read 工具不豁免", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = mkToolMsg(
			"g1",
			"grep",
			{ pattern: "test", path: `${AGENT_DIR}/skills/` },
			"x".repeat(200),
		);
		for (let i = 0; i < 4; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).not.toContain("g1");
	});

	it("path 为 undefined 不豁免", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = mkToolMsg("np1", "read", {}, "x".repeat(200));
		for (let i = 0; i < 4; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).not.toContain("np1");
	});

	it("技能 + 非技能混合：技能保留、非技能删除", async () => {
		const s = mkState(),
			pi = mkPi();
		const skillMsg = mkReadMsg(
			"sk",
			`${AGENT_DIR}/skills/code-graph/SKILL.md`,
			"x".repeat(200),
		);
		const otherMsg = mkReadMsg("ns", "/tmp/other.txt", "x".repeat(200));
		for (let i = 0; i < 4; i++) {
			await trigger(s, [...skillMsg, ...otherMsg], pi);
		}
		const remaining = rem(s.lastMessages);
		expect(remaining).toContain("sk");
		expect(remaining).not.toContain("ns");
	});
});
