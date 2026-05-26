/**
 * 项目级配置覆盖测试
 * 验证 getEffectiveConfig 对 context 配置的覆盖行为
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ── 直接测试 shared-utils 的 project-config ──
import { getEffectiveConfig } from "@pi-atelier/shared-utils";

const TMP_DIR = path.join(os.tmpdir(), `pi-context-project-config-test-${Date.now()}`);

beforeEach(() => {
	fs.mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
	fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("getEffectiveConfig for context section", () => {
	const DEFAULTS = {
		distillThreshold: 5000,
		agingThreshold: 10,
		processorThreshold: 500,
	};

	it("无项目级配置时回退到全局（或默认值）", () => {
		// 无 .pi/settings.json → 回退到全局 settings.json（可能覆盖 defaults）
		const { config, sources } = getEffectiveConfig("context", DEFAULTS, TMP_DIR);
		expect(config.distillThreshold).toBeDefined();
		expect(config.agingThreshold).toBeDefined();
		expect(config.processorThreshold).toBeDefined();
		expect(sources).not.toContain("project");
	});

	it("项目级配置覆盖全局默认", () => {
		// 创建 .pi/settings.json
		const piDir = path.join(TMP_DIR, ".pi");
		fs.mkdirSync(piDir, { recursive: true });
		fs.writeFileSync(
			path.join(piDir, "settings.json"),
			JSON.stringify({
				context: {
					distillThreshold: 9999,
				},
			}),
		);

		const { config, sources } = getEffectiveConfig("context", DEFAULTS, TMP_DIR);
		expect(config.distillThreshold).toBe(9999);
		// 未覆盖的字段回退到全局或 defaults
		expect(typeof config.agingThreshold).toBe("number");
		expect(typeof config.processorThreshold).toBe("number");
		expect(sources.distillThreshold).toBe("project");
	});

	it("项目级配置与全局配置合并", () => {
		// 创建项目级配置，只覆盖一个字段
		const piDir = path.join(TMP_DIR, ".pi");
		fs.mkdirSync(piDir, { recursive: true });
		fs.writeFileSync(
			path.join(piDir, "settings.json"),
			JSON.stringify({
				context: {
					agingThreshold: 20,
				},
			}),
		);

		const { config } = getEffectiveConfig("context", DEFAULTS, TMP_DIR);
		// 覆盖的字段
		expect(config.agingThreshold).toBe(20);
		// 未覆盖的字段回退到全局或 defaults
		expect(typeof config.distillThreshold).toBe("number");
		expect(typeof config.processorThreshold).toBe("number");
	});

	it("空的项目级配置不破坏默认值", () => {
		const piDir = path.join(TMP_DIR, ".pi");
		fs.mkdirSync(piDir, { recursive: true });
		fs.writeFileSync(path.join(piDir, "settings.json"), "{}");

		const { config } = getEffectiveConfig("context", DEFAULTS, TMP_DIR);
		// 空项目配置不改变任何值，回退到全局或 defaults
		expect(typeof config.distillThreshold).toBe("number");
		expect(typeof config.agingThreshold).toBe("number");
		expect(typeof config.processorThreshold).toBe("number");
	});
});
