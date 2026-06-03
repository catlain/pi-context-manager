/**
 * /context-clean 命令测试
 *
 * 依赖 clean.js 的 cleanContextData / listSessionData，使用 vi.mock 隔离。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClean = vi.hoisted(() => ({
	cleanContextData:
		vi.fn<(sessionId?: string) => { cleaned: number; freedMB: number }>(),
	listSessionData: vi.fn<() => { sessionId: string; sizeMB: number }[]>(),
}));

vi.mock("../clean.js", () => mockClean);

import { registerContextCleanCommand } from "../commands.js";

function createMockPi() {
	const handlers: Record<string, Function> = {};
	return {
		registerCommand: vi.fn((name: string, opts: { handler: Function }) => {
			handlers[name] = opts.handler;
		}),
		handlers,
	};
}

function createMockCtx() {
	return { ui: { notify: vi.fn() } };
}

describe("/context-clean", () => {
	let pi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		pi = createMockPi();
		vi.clearAllMocks();
		registerContextCleanCommand(pi as any);
	});

	it("注册命令名为 context-clean", () => {
		expect(pi.registerCommand).toHaveBeenCalledWith(
			"context-clean",
			expect.any(Object),
		);
	});

	it("help 参数显示帮助", async () => {
		const ctx = createMockCtx();
		await pi.handlers["context-clean"]("-h", ctx as any);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("用法"),
			"info",
		);
	});

	it("指定会话 clean 成功通知", async () => {
		mockClean.cleanContextData.mockReturnValue({ cleaned: 1, freedMB: 0.05 });
		const ctx = createMockCtx();
		await pi.handlers["context-clean"]("session-123", ctx as any);
		expect(mockClean.cleanContextData).toHaveBeenCalledWith("session-123");
		const msg = ctx.ui.notify.mock.calls[0][0] as string;
		expect(msg).toContain("session-123");
		expect(msg).toContain("0.05");
	});

	it("指定会话无数据通知", async () => {
		mockClean.cleanContextData.mockReturnValue({ cleaned: 0, freedMB: 0 });
		const ctx = createMockCtx();
		await pi.handlers["context-clean"]("session-nonexist", ctx as any);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("无数据可清理"),
			"info",
		);
	});

	it("无参且无会话时通知无数据", async () => {
		mockClean.listSessionData.mockReturnValue([]);
		const ctx = createMockCtx();
		await pi.handlers["context-clean"]("", ctx as any);
		expect(mockClean.listSessionData).toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("无持久化数据可清理"),
			"info",
		);
	});

	it("无参时清理全部会话", async () => {
		mockClean.listSessionData.mockReturnValue([
			{ sessionId: "sess-a", sizeMB: 0.5 },
			{ sessionId: "sess-b", sizeMB: 1.2 },
		]);
		mockClean.cleanContextData.mockReturnValue({ cleaned: 2, freedMB: 1.7 });
		const ctx = createMockCtx();
		await pi.handlers["context-clean"]("", ctx as any);
		expect(mockClean.cleanContextData).toHaveBeenCalledWith(); // 无参
		const msg = ctx.ui.notify.mock.calls[0][0] as string;
		expect(msg).toContain("全部 2 个会话");
		expect(msg).toContain("1.7");
	});

	it("空字符串（空格）等同于无参", async () => {
		mockClean.listSessionData.mockReturnValue([]);
		const ctx = createMockCtx();
		await pi.handlers["context-clean"]("   ", ctx as any);
		expect(mockClean.listSessionData).toHaveBeenCalled();
	});
});
