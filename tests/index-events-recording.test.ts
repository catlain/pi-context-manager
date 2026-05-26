/**
 * before_provider_request 录制逻辑测试
 *
 * 覆盖：
 * - 录制关闭时不写文件
 * - 录制开启时按会话目录写 payload
 * - payload 序号递增
 * - 异常不影响主流程
 * - sessionId 从 ctx.sessionManager 获取
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { writeFileSync, readdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import os from "os";

// Mock recording 模块
const mockIsRecording = vi.fn(() => false);
vi.mock("../recording.js", () => ({
	isRecording: (...args: any[]) => mockIsRecording(...args),
	setRecording: vi.fn(() => true),
	RECORDINGS_DIR: join(os.tmpdir(), "test-pi-recordings"),
}));

// Mock shared 模块
vi.mock("../shared.js", () => ({
	DISTILL_DIR: join(os.tmpdir(), "test-pi-distill"),
	PAYLOAD_CACHE: join(os.tmpdir(), "test-pi-distill", "last-payload.json"),
	getContextConfig: vi.fn(() => ({
		distillThreshold: 1500,
		processorThreshold: 2000,
		agingThreshold: 8,
	})),
	setContextConfig: vi.fn((v) => v),
	loadManifest: vi.fn(() => ({})),
	saveManifest: vi.fn(),
}));

vi.mock("../handle-context.js", () => ({
	handleContextEvent: vi.fn(),
}));
vi.mock("../context.js", () => ({
	default: vi.fn(),
}));
vi.mock("../clean.js", () => ({
	cleanContextData: vi.fn(() => ({ cleaned: 0, freedMB: 0 })),
	listSessionData: vi.fn(() => []),
}));

import { RECORDINGS_DIR } from "../recording.js";
import { DISTILL_DIR, PAYLOAD_CACHE } from "../shared.js";
import indexModule from "../index.js";

function createMockPi() {
	const events: Record<string, Function> = {};
	return {
		registerCommand: vi.fn(),
		on: vi.fn((name: string, handler: Function) => {
			events[name] = handler;
		}),
		events,
	};
}

describe("before_provider_request 录制", () => {
	let mockPi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		vi.clearAllMocks();
		for (const dir of [RECORDINGS_DIR, DISTILL_DIR]) {
			if (existsSync(dir)) rmSync(dir, { recursive: true });
		}
		mockPi = createMockPi();
	});

	afterEach(() => {
		for (const dir of [RECORDINGS_DIR, DISTILL_DIR]) {
			if (existsSync(dir)) rmSync(dir, { recursive: true });
		}
	});

	it("注册了 before_provider_request 事件", () => {
		indexModule(mockPi as any);
		expect(mockPi.on).toHaveBeenCalledWith(
			"before_provider_request",
			expect.any(Function),
		);
	});

	it("录制关闭时不写 recordings 文件", async () => {
		mockIsRecording.mockReturnValue(false);
		indexModule(mockPi as any);
		const handler = mockPi.events["before_provider_request"];
		await handler({ payload: { messages: [{ role: "user", content: "hi" }] } });
		expect(existsSync(RECORDINGS_DIR)).toBe(false);
	});

	it("录制开启时写 payload 到会话目录", async () => {
		mockIsRecording.mockReturnValue(true);
		indexModule(mockPi as any);
		const handler = mockPi.events["before_provider_request"];
		await handler({ payload: { messages: [{ role: "user", content: "hi" }] } });
		const unknownDir = join(RECORDINGS_DIR, "unknown");
		expect(existsSync(unknownDir)).toBe(true);
		const files = readdirSync(unknownDir).filter((f) => f.endsWith(".json"));
		expect(files.length).toBe(1);
		expect(files[0]).toMatch(/^req-0001-/);
	});

	it("连续录制时序号递增", async () => {
		mockIsRecording.mockReturnValue(true);
		indexModule(mockPi as any);
		const handler = mockPi.events["before_provider_request"];
		const payload = { messages: [{ role: "user", content: "hi" }] };
		await handler({ payload });
		await handler({ payload });
		const unknownDir = join(RECORDINGS_DIR, "unknown");
		const files = readdirSync(unknownDir).filter((f) => f.endsWith(".json"));
		expect(files.length).toBe(2);
		expect(files[0]).toMatch(/^req-0001-/);
		expect(files[1]).toMatch(/^req-0002-/);
	});

	it("总是写 last-payload.json（不受录制开关影响）", async () => {
		mockIsRecording.mockReturnValue(false);
		indexModule(mockPi as any);
		const handler = mockPi.events["before_provider_request"];
		await handler({ payload: { messages: [{ role: "user", content: "hi" }] } });
		expect(existsSync(PAYLOAD_CACHE)).toBe(true);
	});

	it("无 payload 时不崩溃", async () => {
		indexModule(mockPi as any);
		const handler = mockPi.events["before_provider_request"];
		await handler({});
	});

	it("录制异常不影响主流程", async () => {
		mockIsRecording.mockReturnValue(true);
		const origWrite = writeFileSync;
		vi.doMock("fs", () => ({
			...require("fs"),
			writeFileSync: (...args: any[]) => {
				if (args[0]?.toString().includes("recordings")) {
					throw new Error("disk full");
				}
				return origWrite(...args);
			},
		}));
		indexModule(mockPi as any);
		const handler = mockPi.events["before_provider_request"];
		await handler({ payload: { messages: [] } });
	});

	it("优先从 ctx.sessionManager 获取 sessionId", async () => {
		mockIsRecording.mockReturnValue(true);
		indexModule(mockPi as any);
		const handler = mockPi.events["before_provider_request"];
		const payload = { messages: [{ role: "user", content: "hi" }] };
		const ctx = {
			sessionManager: { getSessionId: () => "ctx-session-123" },
		};
		await handler({ payload }, ctx);
		const sessionDir = join(RECORDINGS_DIR, "ctx-session-123");
		expect(existsSync(sessionDir)).toBe(true);
		const files = readdirSync(sessionDir).filter(
			(f: string) => f.endsWith(".json"),
		);
		expect(files.length).toBe(1);
	});

	it("ctx 无 sessionManager 时 fallback 到闭包 sessionId", async () => {
		mockIsRecording.mockReturnValue(true);
		indexModule(mockPi as any);
		const handler = mockPi.events["before_provider_request"];
		await handler({
			payload: { messages: [{ role: "user", content: "hi" }] },
		});
		const unknownDir = join(RECORDINGS_DIR, "unknown");
		expect(existsSync(unknownDir)).toBe(true);
	});
});
