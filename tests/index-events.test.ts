/**
 * index.ts 事件注册完整性测试
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../recording.js", () => ({
	isRecording: vi.fn(() => false),
	setRecording: vi.fn(() => true),
	RECORDINGS_DIR: "/tmp/test-pi-recordings",
}));
vi.mock("../shared.js", () => ({
	DISTILL_DIR: "/tmp/test-pi-distill",
	PAYLOAD_CACHE: "/tmp/test-pi-distill/last-payload.json",
	getContextConfig: vi.fn(() => ({
		distillThreshold: 1500,
		processorThreshold: 2000,
		agingThreshold: 8,
	})),
	setContextConfig: vi.fn((v) => v),
	loadManifest: vi.fn(() => ({})),
	saveManifest: vi.fn(),
}));
vi.mock("../handle-context.js", () => ({ handleContextEvent: vi.fn() }));
vi.mock("../context.js", () => ({ default: vi.fn() }));
vi.mock("../clean.js", () => ({
	cleanContextData: vi.fn(() => ({ cleaned: 0, freedMB: 0 })),
	listSessionData: vi.fn(() => []),
}));

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

describe("事件注册完整性", () => {
	let mockPi: ReturnType<typeof createMockPi>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockPi = createMockPi();
	});

	it("注册了 context 和 before_provider_request 两个事件", () => {
		indexModule(mockPi as any);
		expect(mockPi.on).toHaveBeenCalledWith("context", expect.any(Function));
		expect(mockPi.on).toHaveBeenCalledWith(
			"before_provider_request",
			expect.any(Function),
		);
	});

	it("注册了所有命令", () => {
		indexModule(mockPi as any);
		const commands = mockPi.registerCommand.mock.calls.map(
			(c: any[]) => c[0],
		);
		expect(commands).toContain("record");
		expect(commands).toContain("distill-config");
		expect(commands).toContain("aging-config");
		expect(commands).toContain("processor-config");
		expect(commands).toContain("context-clean");
	});
});
