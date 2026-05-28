/**
 * /aging-config 和 /processor-config 命令测试
 *
 * 共用 shared.js mock（getContextConfig / setContextConfig），各自独立 describe 块。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

let mockConfig: Record<string, number>;
let lastPatch: Record<string, number> | null = null;

vi.mock("../shared.js", () => ({
	DISTILL_DIR: "/tmp/test-distill",
	getContextConfig: () => mockConfig,
	setContextConfig: (patch: Record<string, number>) => {
		lastPatch = patch;
		mockConfig = { ...mockConfig, ...patch };
		return mockConfig;
	},
}));

import {
	registerAgingConfigCommand,
	registerProcessorConfigCommand,
} from "../commands.js";

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

beforeEach(() => {
	mockConfig = {
		distillThreshold: 5000,
		agingThreshold: 10,
		processorThreshold: 500,
		firstSeenCap: 15000,
	};
	lastPatch = null;
	vi.clearAllMocks();
});

// ==================================================================
// /aging-config
// ==================================================================
describe("/aging-config", () => {
	let pi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		pi = createMockPi();
		registerAgingConfigCommand(pi as any);
	});

	it("注册命令名为 aging-config", () => {
		expect(pi.registerCommand).toHaveBeenCalledWith(
			"aging-config",
			expect.any(Object),
		);
	});

	it("无参显示当前配置", async () => {
		const ctx = createMockCtx();
		await pi.handlers["aging-config"]("", ctx as any);
		expect(ctx.ui.notify).toHaveBeenCalledOnce();
		const msg = ctx.ui.notify.mock.calls[0][0] as string;
		expect(msg).toContain("agingThreshold = 10");
	});

	it("设置 agingThreshold 数值", async () => {
		const ctx = createMockCtx();
		await pi.handlers["aging-config"]("5", ctx as any);
		expect(lastPatch).toEqual({ agingThreshold: 5 });
		expect(ctx.ui.notify.mock.calls[0][0]).toContain("5");
	});

	it("设置 agingThreshold 为 0（整数）", async () => {
		const ctx = createMockCtx();
		await pi.handlers["aging-config"]("0", ctx as any);
		expect(lastPatch).toEqual({ agingThreshold: 0 });
		const msg = ctx.ui.notify.mock.calls[0][0] as string;
		expect(msg).toContain("0");
		expect(msg).toContain("禁用");
	});

	it("off 参数禁用 aging", async () => {
		const ctx = createMockCtx();
		await pi.handlers["aging-config"]("off", ctx as any);
		expect(lastPatch).toEqual({ agingThreshold: 0 });
	});

	it("-h 被视为无效值报错（源码无 help 处理）", async () => {
		const ctx = createMockCtx();
		await pi.handlers["aging-config"]("-h", ctx as any);
		expect(ctx.ui.notify.mock.calls[0][1]).toBe("error");
	});

	it("无效值（非整数）报错", async () => {
		const ctx = createMockCtx();
		await pi.handlers["aging-config"]("abc", ctx as any);
		expect(ctx.ui.notify.mock.calls[0][1]).toBe("error");
	});

	it("无效值（负数）报错", async () => {
		const ctx = createMockCtx();
		await pi.handlers["aging-config"]("-1", ctx as any);
		expect(ctx.ui.notify.mock.calls[0][1]).toBe("error");
	});

	it("无效值（小数）报错", async () => {
		const ctx = createMockCtx();
		await pi.handlers["aging-config"]("3.5", ctx as any);
		expect(ctx.ui.notify.mock.calls[0][1]).toBe("error");
	});
});

// ==================================================================
// /processor-config
// ==================================================================
describe("/processor-config", () => {
	let pi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		pi = createMockPi();
		registerProcessorConfigCommand(pi as any);
	});

	it("注册命令名为 processor-config", () => {
		expect(pi.registerCommand).toHaveBeenCalledWith(
			"processor-config",
			expect.any(Object),
		);
	});

	it("无参显示当前配置", async () => {
		const ctx = createMockCtx();
		await pi.handlers["processor-config"]("", ctx as any);
		expect(ctx.ui.notify).toHaveBeenCalledOnce();
		const msg = ctx.ui.notify.mock.calls[0][0] as string;
		expect(msg).toContain("processorThreshold = 500");
	});

	it("设置 processorThreshold", async () => {
		const ctx = createMockCtx();
		await pi.handlers["processor-config"]("1000", ctx as any);
		expect(lastPatch).toEqual({ processorThreshold: 1000 });
		expect(ctx.ui.notify.mock.calls[0][0]).toContain("1000");
	});

	it("off 禁用 processor", async () => {
		const ctx = createMockCtx();
		await pi.handlers["processor-config"]("off", ctx as any);
		expect(lastPatch).toEqual({ processorThreshold: 0 });
		const msg = ctx.ui.notify.mock.calls[0][0] as string;
		expect(msg).toContain("后处理器禁用");
	});

	it("0 禁用 processor", async () => {
		const ctx = createMockCtx();
		await pi.handlers["processor-config"]("0", ctx as any);
		expect(lastPatch).toEqual({ processorThreshold: 0 });
		expect(ctx.ui.notify.mock.calls[0][0]).toContain("后处理器禁用");
	});

	it("-h 被视为无效值报错（源码无 help 处理）", async () => {
		const ctx = createMockCtx();
		await pi.handlers["processor-config"]("-h", ctx as any);
		expect(ctx.ui.notify.mock.calls[0][1]).toBe("error");
	});

	it("无效值报错", async () => {
		const ctx = createMockCtx();
		await pi.handlers["processor-config"]("abc", ctx as any);
		expect(ctx.ui.notify.mock.calls[0][1]).toBe("error");
	});

	it("负数报错", async () => {
		const ctx = createMockCtx();
		await pi.handlers["processor-config"]("-5", ctx as any);
		expect(ctx.ui.notify.mock.calls[0][1]).toBe("error");
	});

	it("负数分支兜底", async () => {
		const ctx = createMockCtx();
		await pi.handlers["processor-config"]("-1", ctx as any);
		expect(ctx.ui.notify.mock.calls[0][1]).toBe("error");
	});
});
