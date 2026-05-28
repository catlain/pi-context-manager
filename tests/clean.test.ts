/**
 * clean.ts 单元测试
 *
 * 覆盖：listSessionData, cleanContextData
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from "fs";
import { join } from "path";

vi.hoisted(() => {
	const { join: pJoin } = require("path") as typeof import("path");
	const os = require("os") as typeof import("os");
	process.env.HOME = pJoin(os.tmpdir(), "pi-clean-test-" + Date.now());
});

vi.mock("@pi-atelier/shared-utils", () => ({
	getSettingsSection: vi.fn((_s: string, defaults: any) => ({ ...defaults })),
	patchSettingsSection: vi.fn((_s: string, patch: any, defaults: any) => ({
		...defaults,
		...patch,
	})),
	setSettingsValue: vi.fn(),
	getSettingsValue: vi.fn(),
}));

import { listSessionData, cleanContextData } from "../clean.js";
import { DISTILL_DIR } from "../shared.js";

/**
 * 辅助：在 DISTILL_DIR 下创建模拟会话目录
 * 目录名看起来像 UUID（length ≥ 8）
 */
function createSessionDir(id: string, fileSize = 100) {
	const d = join(DISTILL_DIR, id);
	mkdirSync(d, { recursive: true });
	writeFileSync(join(d, "data.jsonl"), "x".repeat(fileSize), "utf-8");
}

function createProcessorDir() {
	const d = join(DISTILL_DIR, "processor");
	mkdirSync(d, { recursive: true });
	writeFileSync(join(d, "bash-test.txt"), "x".repeat(100), "utf-8");
}

function createCacheFiles() {
	writeFileSync(join(DISTILL_DIR, "last-messages.json"), "[]", "utf-8");
	writeFileSync(join(DISTILL_DIR, "last-payload.json"), "{}", "utf-8");
}

beforeAll(() => {
	mkdirSync(DISTILL_DIR, { recursive: true });
});

/** 确保每轮测试从空 DISTILL_DIR 开始 */
beforeEach(() => {
	if (existsSync(DISTILL_DIR)) {
		for (const e of readdirSync(DISTILL_DIR)) {
			rmSync(join(DISTILL_DIR, e), { recursive: true, force: true });
		}
	}
});

// ===== listSessionData =====

describe("listSessionData", () => {
	it("空目录时返回空数组", () => {
		expect(listSessionData()).toEqual([]);
	});

	it("列出会话目录并计算大小", () => {
		createSessionDir("session-abc-123", 2048); // 2KB
		const r = listSessionData();
		expect(r).toHaveLength(1);
		expect(r[0].sessionId).toBe("session-abc-123");
		expect(r[0].sizeMB).toBeCloseTo(2048 / 1024 / 1024, 6);
	});

	it("跳过非目录条目和短名称目录（< 8 字符）", () => {
		mkdirSync(join(DISTILL_DIR, "abc"), { recursive: true }); // 短名，应被跳过
		createSessionDir("long-session-id", 100);
		writeFileSync(join(DISTILL_DIR, "a-file.txt"), "content", "utf-8");
		const r = listSessionData();
		expect(r).toHaveLength(1);
		expect(r[0].sessionId).toBe("long-session-id");
	});

	it("递归计算子目录大小", () => {
		const dir = join(DISTILL_DIR, "nested-session");
		mkdirSync(join(dir, "sub"), { recursive: true });
		writeFileSync(join(dir, "sub", "data.txt"), "x".repeat(1024), "utf-8");
		writeFileSync(join(dir, "main.txt"), "x".repeat(512), "utf-8");
		const r = listSessionData();
		expect(r).toHaveLength(1);
		// 总大小 ≈ 1024 + 512 = 1536
		expect(r[0].sizeMB).toBeCloseTo(1536 / 1024 / 1024, 6);
	});
});

// ===== cleanContextData =====

describe("cleanContextData", () => {
	it("不存在的 sessionId 返回 0", () => {
		createSessionDir("real-session");
		const r = cleanContextData("nonexistent");
		expect(r).toEqual({ cleaned: 0, freedMB: 0 });
		// 真实会话不受影响
		expect(listSessionData()).toHaveLength(1);
	});

	it("清理指定会话", () => {
		createSessionDir("long-session-1", 51200); // ~50KB → 0.05MB
		createSessionDir("long-session-2", 1024);
		const r = cleanContextData("long-session-1");
		expect(r.cleaned).toBe(1);
		expect(r.freedMB).toBeCloseTo(0.05, 2);
		expect(listSessionData()).toHaveLength(1);
		expect(listSessionData()[0].sessionId).toBe("long-session-2");
	});

	it("DISTILL_DIR 不存在时清除全部返回 0", () => {
		rmSync(DISTILL_DIR, { recursive: true, force: true });
		const r = cleanContextData();
		expect(r).toEqual({ cleaned: 0, freedMB: 0 });
	});

	it("无参数时清理所有会话 + processor + 缓存文件", () => {
		createSessionDir("long-sess-a", 1000);
		createSessionDir("long-sess-b", 2000);
		createProcessorDir();
		createCacheFiles();

		const r = cleanContextData();
		expect(r.cleaned).toBe(3); // 2 会话 + 1 processor 目录（名 >= 8 字符）
		expect(r.freedMB).toBeGreaterThanOrEqual(0);
		expect(listSessionData()).toEqual([]);
	});

	it("清理后 processor 目录和缓存文件也被删除", () => {
		createSessionDir("sess-single", 100);
		createProcessorDir();
		createCacheFiles();

		cleanContextData();
		expect(existsSync(join(DISTILL_DIR, "processor"))).toBe(false);
		expect(existsSync(join(DISTILL_DIR, "last-messages.json"))).toBe(false);
		expect(existsSync(join(DISTILL_DIR, "last-payload.json"))).toBe(false);
	});
});
