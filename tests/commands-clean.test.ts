/**
 * /context-clean 命令测试
 *
 * 依赖 clean.js 的 cleanContextData，使用 vi.mock 隔离。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type CleanResult = {
	cleaned: number;
	freedMB: number;
	status: "cleaned" | "not_found" | "ambiguous";
	candidates: string[];
};

const mockClean = vi.hoisted(() => ({
	cleanContextData: vi.fn<(sessionId?: string) => CleanResult>(),
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

function ok(cleaned = 1, freedMB = 0.05): CleanResult {
	return { cleaned, freedMB, status: "cleaned", candidates: [] };
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
		mockClean.cleanContextData.mockReturnValue(ok(1, 0.05));
		const ctx = createMockCtx();
		await pi.handlers["context-clean"]("session-123", ctx as any);
		expect(mockClean.cleanContextData).toHaveBeenCalledWith("session-123");
		const msg = ctx.ui.notify.mock.calls[0][0] as string;
		expect(msg).toContain("session-123");
		expect(msg).toContain("0.05");
	});

	it("指定会话未找到时通知并给出候选尾段", async () => {
		mockClean.cleanContextData.mockReturnValue({
			cleaned: 0,
			freedMB: 0,
			status: "not_found",
			candidates: ["019feeed-5337-747e-91b2-32042ddbef95"],
		});
		const ctx = createMockCtx();
		await pi.handlers["context-clean"]("session-nonexist", ctx as any);
		const msg = ctx.ui.notify.mock.calls[0][0] as string;
		expect(msg).toContain("未找到会话");
		expect(msg).toContain("32042ddbef95"); // 候选尾段辅助
	});

	it("多义匹配时警告并提示补全", async () => {
		mockClean.cleanContextData.mockReturnValue({
			cleaned: 0,
			freedMB: 0,
			status: "ambiguous",
			candidates: [
				"019feeed-5337-747e-91b2-32042ddbef95",
				"019aaaaa-bbbb-cccc-91b2-32042ddbef95",
			],
		});
		const ctx = createMockCtx();
		await pi.handlers["context-clean"]("91b2-32042ddbef95", ctx as any);
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("多个会话"),
			"warning",
		);
		const msg = ctx.ui.notify.mock.calls[0][0] as string;
		expect(msg).toContain("019feeed-5337-747e-91b2-32042ddbef95");
	});

	it("无参且无数据时通知无数据", async () => {
		mockClean.cleanContextData.mockReturnValue({
			cleaned: 0,
			freedMB: 0,
			status: "cleaned",
			candidates: [],
		});
		const ctx = createMockCtx();
		await pi.handlers["context-clean"]("", ctx as any);
		expect(mockClean.cleanContextData).toHaveBeenCalledWith(); // 无参
		expect(ctx.ui.notify).toHaveBeenCalledWith(
			expect.stringContaining("无持久化数据可清理"),
			"info",
		);
	});

	it("无参时清理全部会话", async () => {
		mockClean.cleanContextData.mockReturnValue(ok(2, 1.7));
		const ctx = createMockCtx();
		await pi.handlers["context-clean"]("", ctx as any);
		expect(mockClean.cleanContextData).toHaveBeenCalledWith(); // 无参
		const msg = ctx.ui.notify.mock.calls[0][0] as string;
		expect(msg).toContain("全部 2 个会话");
		expect(msg).toContain("1.7");
	});

	it("空字符串（空格）等同于无参", async () => {
		mockClean.cleanContextData.mockReturnValue({
			cleaned: 0,
			freedMB: 0,
			status: "cleaned",
			candidates: [],
		});
		const ctx = createMockCtx();
		await pi.handlers["context-clean"]("   ", ctx as any);
		expect(mockClean.cleanContextData).toHaveBeenCalledWith();
	});
});
