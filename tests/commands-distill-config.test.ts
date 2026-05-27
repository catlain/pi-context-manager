/**
 * /distill-config 命令测试 — 显示/设置 distillThreshold 和 firstSeenCap
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

import { registerDistillConfigCommand } from "../commands.js";

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
	const notifications: { msg: string; level: string }[] = [];
	return {
		ui: {
			notify: vi.fn((msg: string, level: string) => {
				notifications.push({ msg, level });
			}),
		},
		notifications,
	};
}

beforeEach(() => {
	mockConfig = { distillThreshold: 1000, agingThreshold: 10, processorThreshold: 0, firstSeenCap: 15000 };
	lastPatch = null;
});

describe("/distill-config", () => {
	it("无参显示当前配置", async () => {
		const pi = createMockPi();
		registerDistillConfigCommand(pi as any);
		const ctx = createMockCtx();
		await pi.handlers["distill-config"]("", ctx as any);
		expect(ctx.ui.notify).toHaveBeenCalledOnce();
		const msg = ctx.ui.notify.mock.calls[0][0];
		expect(msg).toContain("distillThreshold = 1000");
		expect(msg).toContain("firstSeenCap = 15000");
	});

	it("设置 distillThreshold", async () => {
		const pi = createMockPi();
		registerDistillConfigCommand(pi as any);
		const ctx = createMockCtx();
		await pi.handlers["distill-config"]("2000", ctx as any);
		expect(lastPatch).toEqual({ distillThreshold: 2000 });
		expect(ctx.ui.notify.mock.calls[0][0]).toContain("2000");
	});

	it("无效值报错", async () => {
		const pi = createMockPi();
		registerDistillConfigCommand(pi as any);
		const ctx = createMockCtx();
		await pi.handlers["distill-config"]("abc", ctx as any);
		expect(ctx.ui.notify.mock.calls[0][1]).toBe("error");
	});

	it("--cap 设置 firstSeenCap", async () => {
		const pi = createMockPi();
		registerDistillConfigCommand(pi as any);
		const ctx = createMockCtx();
		await pi.handlers["distill-config"]("--cap 20000", ctx as any);
		expect(lastPatch).toEqual({ firstSeenCap: 20000 });
		expect(ctx.ui.notify.mock.calls[0][0]).toContain("20000");
	});

	it("--cap 0 显示不设上限", async () => {
		const pi = createMockPi();
		registerDistillConfigCommand(pi as any);
		const ctx = createMockCtx();
		await pi.handlers["distill-config"]("--cap 0", ctx as any);
		expect(lastPatch).toEqual({ firstSeenCap: 0 });
		expect(ctx.ui.notify.mock.calls[0][0]).toContain("不设上限");
	});

	it("--cap 无效值报错", async () => {
		const pi = createMockPi();
		registerDistillConfigCommand(pi as any);
		const ctx = createMockCtx();
		await pi.handlers["distill-config"]("--cap abc", ctx as any);
		expect(ctx.ui.notify.mock.calls[0][1]).toBe("error");
	});
});
