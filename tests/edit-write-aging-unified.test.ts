/**
 * edit/write aging 统一阈值集成测试
 *
 * 覆盖（unify-aging-edit-write）：edit/write 成功结果与所有工具共享 agingThreshold 正常淘汰；
 * 成功大文件走 largeResultAging（A 优先级恢复生效）；错误结果走 errorAgingThreshold。
 * firstSeenCap 兜底场景见 edit-write-first-seen-cap.test.ts；
 * read 豁免路径回归见 aging-exempt-regression.test.ts。
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
// edit/write 成功结果按统一 agingThreshold 淘汰 (C)
// ════════════════════════════════════════
describe("edit/write 成功结果按统一 agingThreshold 淘汰", () => {
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

	it("edit 成功结果在 agingThreshold 轮后被淘汰", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = mkMsg("e1", "edit", { path: "/x/a.ts" }, "已编辑");
		for (let i = 0; i < 2; i++) await trigger(s, [...msgs], pi);
		expect(rem(s.lastMessages)).toContain("e1"); // 未达 agingThreshold=3
		await trigger(s, [...msgs], pi); // 第3轮
		expect(s.agingDeletedIds.has("e1")).toBe(true);
	});

	it("write 成功结果在 agingThreshold 轮后被淘汰", async () => {
		const s = mkState(),
			pi = mkPi();
		const msgs = mkMsg("w1", "write", { path: "/x/b.ts" }, "已写入");
		for (let i = 0; i < 3; i++) await trigger(s, [...msgs], pi);
		expect(s.agingDeletedIds.has("w1")).toBe(true);
	});

	it("混合：edit 与 bash 同轮淘汰", async () => {
		const s = mkState(),
			pi = mkPi();
		const editMsg = mkMsg("e2", "edit", { path: "/x/a.ts" }, "已编辑");
		const bashMsg = mkMsg("b2", "bash", { command: "ls" }, "output");
		for (let i = 0; i < 3; i++)
			await trigger(s, [...editMsg, ...bashMsg], pi);
		expect(s.agingDeletedIds.has("e2")).toBe(true);
		expect(s.agingDeletedIds.has("b2")).toBe(true);
	});

	it("混合：write 与 read 同轮淘汰", async () => {
		const s = mkState(),
			pi = mkPi();
		const writeMsg = mkMsg("w2", "write", { path: "/x/c.ts" }, "已写入");
		const readMsg = mkMsg("r2", "read", { path: "/x/d.ts" }, "content");
		for (let i = 0; i < 3; i++)
			await trigger(s, [...writeMsg, ...readMsg], pi);
		expect(s.agingDeletedIds.has("w2")).toBe(true);
		expect(s.agingDeletedIds.has("r2")).toBe(true);
	});
});

// ════════════════════════════════════════
// edit/write 成功大文件结果走 largeResultAging (A)
// ════════════════════════════════════════
describe("edit/write 成功大文件结果走 largeResultAging", () => {
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

	it("edit 成功大文件结果在 largeResultAging 轮后被淘汰", async () => {
		const s = mkState(),
			pi = mkPi();
		// 500 字符 = 125 tokens > distillThreshold=100 → 走 largeResultAging=2
		// unify 后 A 优先级对成功 edit 恢复生效，第 2 轮删除
		const bigEdit = mkMsg("e3", "edit", { path: "/x/a.ts" }, "x".repeat(500));
		await trigger(s, [...bigEdit], pi); // 轮1
		expect(rem(s.lastMessages)).toContain("e3");
		await trigger(s, [...bigEdit], pi); // 轮2：largeResultAging=2 删除
		expect(s.agingDeletedIds.has("e3")).toBe(true);
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
// 存量计数无缝衔接（resume 后原永生结果正常淘汰）
// ════════════════════════════════════════
describe("存量计数无缝衔接", () => {
	beforeEach(() => {
		agingMockState.config = {
			distillThreshold: 1000,
			agingThreshold: 20,
			errorAgingThreshold: 5,
			largeResultAging: 5,
			processorThreshold: 0,
			firstSeenCap: 15000,
		};
		agingMockState.tokensFn = (t) => Math.ceil(t.length / 4);
	});

	it("计数 516 的 edit 结果 resume 后下一轮即删（≥ agingThreshold）", async () => {
		const s = mkState(),
			pi = mkPi();
		// 模拟 loadManifest 恢复的存量计数（旧版 Infinity 豁免下累至 516）
		s.agingTracker.set("e516", 516);
		const msgs = mkMsg("e516", "edit", { path: "/x/a.ts" }, "已编辑");
		await trigger(s, [...msgs], pi); // 下一轮 context 事件
		// count = 516 + 1 = 517 >= agingThreshold(20) → 无需等待重新计数，立即删除
		expect(s.agingDeletedIds.has("e516")).toBe(true);
		expect(rem(s.lastMessages)).not.toContain("e516");
	});
});
