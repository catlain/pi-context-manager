/**
 * clean.ts 单元测试
 *
 * 覆盖：listSessionData, resolveSessionId, cleanContextData
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	const { join: pJoin } = require("node:path") as typeof import("path");
	const os = require("node:os") as typeof import("os");
	process.env.HOME = pJoin(os.tmpdir(), `pi-clean-test-${Date.now()}`);
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

import { cleanContextData, listSessionData } from "../clean.js";
import { DISTILL_DIR } from "../shared.js";

/** 在 DISTILL_DIR 下创建模拟会话目录（manifest 类） */
function createSessionDir(id: string, fileSize = 100) {
	const d = join(DISTILL_DIR, id);
	mkdirSync(d, { recursive: true });
	writeFileSync(join(d, "data.jsonl"), "x".repeat(fileSize), "utf-8");
}

/** 在 recordings/<sid>/ 下创建录制产物 */
function createRecordingsDir(sid: string, fileSize = 100) {
	const d = join(DISTILL_DIR, "recordings", sid);
	mkdirSync(d, { recursive: true });
	writeFileSync(join(d, "req-1.json"), "x".repeat(fileSize), "utf-8");
}

/** 在 processor/<sid>/ 下创建原文产物（新结构） */
function createProcessorSessionDir(sid: string, fileSize = 100) {
	const d = join(DISTILL_DIR, "processor", sid);
	mkdirSync(d, { recursive: true });
	writeFileSync(join(d, "bash-123.txt"), "x".repeat(fileSize), "utf-8");
}

/** 旧式 processor 散落文件（根目录，用于全量清理测试） */
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

	it("跳过 recordings / processor 功能目录", () => {
		createSessionDir("long-session-id", 100);
		mkdirSync(join(DISTILL_DIR, "recordings"), { recursive: true });
		mkdirSync(join(DISTILL_DIR, "processor"), { recursive: true });
		const r = listSessionData();
		expect(r).toHaveLength(1); // 只有真实会话，不含 recordings/processor
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
	it("不存在的 sessionId 返回 not_found + 候选列表", () => {
		createSessionDir("real-session-12345");
		const r = cleanContextData("nonexistent");
		expect(r.status).toBe("not_found");
		expect(r.cleaned).toBe(0);
		expect(r.candidates).toContain("real-session-12345");
		// 真实会话不受影响
		expect(listSessionData()).toHaveLength(1);
	});

	it("清理指定会话（完整 id）", () => {
		createSessionDir("long-session-1", 51200); // ~50KB → 0.05MB
		createSessionDir("long-session-2", 1024);
		const r = cleanContextData("long-session-1");
		expect(r.status).toBe("cleaned");
		expect(r.cleaned).toBe(1);
		expect(r.freedMB).toBeCloseTo(0.05, 2);
		expect(listSessionData()).toHaveLength(1);
		expect(listSessionData()[0].sessionId).toBe("long-session-2");
	});

	it("短 id 后缀清理三处产物（recordings + manifest + processor）", () => {
		const sid = "019feeed-5337-747e-91b2-32042ddbef95";
		createSessionDir(sid, 100);
		createRecordingsDir(sid, 100);
		createProcessorSessionDir(sid, 100);
		// 别的会话不受影响
		createSessionDir("019fffff-0000-0000-0000-000000000000", 100);

		const r = cleanContextData("91b2-32042ddbef95"); // 短 id 后缀
		expect(r.status).toBe("cleaned");
		expect(r.cleaned).toBe(3); // 三处目录
		// 目标会话三处产物都没了
		expect(existsSync(join(DISTILL_DIR, sid))).toBe(false);
		expect(existsSync(join(DISTILL_DIR, "recordings", sid))).toBe(false);
		expect(existsSync(join(DISTILL_DIR, "processor", sid))).toBe(false);
		// 别的会话仍在
		expect(
			existsSync(join(DISTILL_DIR, "019fffff-0000-0000-0000-000000000000")),
		).toBe(true);
	});

	it("多义后缀匹配返回 ambiguous（不静默清理）", () => {
		createSessionDir("019feeed-5337-747e-91b2-32042ddbef95");
		createSessionDir("019aaaaa-bbbb-cccc-91b2-32042ddbef95"); // 相同尾段
		const r = cleanContextData("91b2-32042ddbef95");
		expect(r.status).toBe("ambiguous");
		expect(r.candidates).toHaveLength(2);
		expect(r.cleaned).toBe(0);
		// 两个会话都未被删除
		expect(listSessionData()).toHaveLength(2);
	});

	it("单会话清理不触碰全局缓存", () => {
		createSessionDir("long-session-1");
		createCacheFiles();
		cleanContextData("long-session-1");
		expect(existsSync(join(DISTILL_DIR, "last-messages.json"))).toBe(true);
		expect(existsSync(join(DISTILL_DIR, "last-payload.json"))).toBe(true);
	});

	it("DISTILL_DIR 不存在时全量清理返回 0", () => {
		rmSync(DISTILL_DIR, { recursive: true, force: true });
		const r = cleanContextData();
		expect(r.status).toBe("cleaned");
		expect(r.cleaned).toBe(0);
		expect(r.freedMB).toBe(0);
	});

	it("无参数时清理所有会话 + processor + 缓存文件", () => {
		createSessionDir("long-sess-a", 1000);
		createSessionDir("long-sess-b", 2000);
		createProcessorDir();
		createCacheFiles();

		const r = cleanContextData();
		expect(r.cleaned).toBe(2); // 2 个真实会话（processor 不计入会话数）
		expect(r.freedMB).toBeGreaterThanOrEqual(0);
		expect(listSessionData()).toEqual([]);
	});

	it("清理后 processor 目录和缓存文件也被删除", () => {
		createSessionDir("sess-single-12345", 100);
		createProcessorDir();
		createCacheFiles();

		cleanContextData();
		expect(existsSync(join(DISTILL_DIR, "processor"))).toBe(false);
		expect(existsSync(join(DISTILL_DIR, "last-messages.json"))).toBe(false);
		expect(existsSync(join(DISTILL_DIR, "last-payload.json"))).toBe(false);
	});
});
