/**
 * shared.ts 单元测试（纯函数 / 无副作用的导出）
 *
 * 覆盖：fillTemplate, 常量, hintsConfig 默认值,
 *      getContextConfig, setContextConfig
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock 工厂被 hoist 到顶部，所以用 vi.hoisted 定义数据
const mockFs = vi.hoisted(() => ({
	existsSync: vi.fn(() => false),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock("fs", async (importOriginal) => {
	return {
		...(await importOriginal<typeof import("fs")>()),
		existsSync: mockFs.existsSync,
		mkdirSync: mockFs.mkdirSync,
		readFileSync: mockFs.readFileSync,
		writeFileSync: mockFs.writeFileSync,
	};
});

const mockSettingsData = vi.hoisted(() => ({}) as Record<string, any>);

vi.mock("@pi-atelier/shared-utils", () => ({
	getSettingsSection: vi.fn(
		(section: string, defaults: Record<string, any>) => ({
			...defaults,
			...mockSettingsData[section],
		}),
	),
	patchSettingsSection: vi.fn(
		(
			section: string,
			patch: Record<string, any>,
			defaults: Record<string, any>,
		) => {
			mockSettingsData[section] = { ...mockSettingsData[section], ...patch };
			return { ...defaults, ...mockSettingsData[section] };
		},
	),
	setSettingsValue: vi.fn(),
	getSettingsValue: vi.fn(),
}));

import {
	DISTILL_DIR,
	fillTemplate,
	getContextConfig,
	hintsConfig,
	MSG_CACHE,
	PAYLOAD_CACHE,
	setContextConfig,
} from "../shared.js";

// ===== 常量 =====

describe("常量", () => {
	it("DISTILL_DIR 包含 .pi/agent/distill", () => {
		expect(DISTILL_DIR).toMatch(/[\\/]\.pi[\\/]agent[\\/]distill/);
	});

	it("MSG_CACHE 和 PAYLOAD_CACHE 基于 DISTILL_DIR", () => {
		expect(MSG_CACHE).toContain(DISTILL_DIR);
		expect(MSG_CACHE).toContain("last-messages.json");
		expect(PAYLOAD_CACHE).toContain(DISTILL_DIR);
		expect(PAYLOAD_CACHE).toContain("last-payload.json");
	});
});

// ===== hintsConfig 默认值 =====

describe("hintsConfig 默认值", () => {
	it("包含所有模板键", () => {
		expect(hintsConfig).toHaveProperty("distillWarning");
		expect(hintsConfig).toHaveProperty("distillWarningShort");
		expect(hintsConfig).toHaveProperty("distillOverCapWarning");
		expect(hintsConfig).toHaveProperty("distillOverCapWarningShort");
		expect(hintsConfig).toHaveProperty("processorSummary");
		expect(hintsConfig).toHaveProperty("processorSmallResult");
	});

	it("默认 distillWarning 包含占位符", () => {
		expect(hintsConfig.distillWarning).toContain("{label}");
		expect(hintsConfig.distillWarning).toContain("{tokens}");
	});
});

// ===== fillTemplate =====

describe("fillTemplate", () => {
	it("替换所有占位符", () => {
		const r = fillTemplate("Hello {name}, age {age}", {
			name: "Alice",
			age: "30",
		});
		expect(r).toBe("Hello Alice, age 30");
	});

	it("缺少的占位符保留原样", () => {
		expect(fillTemplate("{a} {b}", { a: "x" })).toBe("x {b}");
	});

	it("无占位符返回原文", () => {
		expect(fillTemplate("plain", {})).toBe("plain");
	});

	it("空模板", () => {
		expect(fillTemplate("", { k: "v" })).toBe("");
	});

	it("多个相同占位符全部替换", () => {
		expect(fillTemplate("{x}+{x}={y}", { x: "1", y: "2" })).toBe("1+1=2");
	});
});

// ===== getContextConfig / setContextConfig =====

describe("getContextConfig / setContextConfig", () => {
	beforeEach(() => {
		// 清空 mock 数据
		for (const k of Object.keys(mockSettingsData)) delete mockSettingsData[k];
	});

	it("getContextConfig 返回默认值", () => {
		const cfg = getContextConfig();
		expect(cfg.distillThreshold).toBe(5000);
		expect(cfg.agingThreshold).toBe(10);
		expect(cfg.processorThreshold).toBe(500);
		expect(cfg.firstSeenCap).toBe(15000);
	});

	it("setContextConfig 更新并返回", () => {
		const u = setContextConfig({ distillThreshold: 9999 });
		expect(u.distillThreshold).toBe(9999);
		expect(u.agingThreshold).toBe(10);
	});

	it("setContextConfig 多次调用累积", () => {
		setContextConfig({ distillThreshold: 1000 });
		setContextConfig({ agingThreshold: 5 });
		const cfg = getContextConfig();
		expect(cfg.distillThreshold).toBe(1000);
		expect(cfg.agingThreshold).toBe(5);
	});

	it("setContextConfig 空 patch 不改变配置", () => {
		const before = getContextConfig();
		const after = setContextConfig({});
		expect(after).toEqual(before);
	});
});
