/**
 * edit/write aging 豁免集成测试
 *
 * 覆盖 spec 的全部场景：
 * - edit/write 成功结果永不因轮数/大文件淘汰
 * - edit/write 错误结果走 errorAgingThreshold
 * - edit/write 仍受 firstSeenCap 兜底
 *
 * 豁免路径回归（skill 豁免、plans/openspec 不再豁免、ADR 新豁免）见 aging-exempt-regression.test.ts。
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

// ════════════════════════════════════════
// edit/write 成功结果豁免轮数 aging (C)
// ════════════════════════════════════════
describe("edit/write 成功结果豁免轮数 aging", () => {
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
		agingMockState.config = {
			distillThreshold: 1000,
			agingThreshold: 10,
			errorAgingThreshold: 3,
			largeResultAging: 2,
			processorThreshold: 0,
			firstSeenCap: 15000,
		};
		agingMockState.tokensFn = (t) => Math.ceil(t.length / 4);
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
