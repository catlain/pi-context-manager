/**
 * shared.ts 写入失败场景测试
 *
 * 验证：写入操作失败时 console.warn 而非静默忽略
 * 覆盖：writeCachedMessages, saveManifest
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// 用临时 HOME 目录，隔离文件系统
vi.hoisted(() => {
	const { join: pJoin } = require("node:path") as typeof import("path");
	const os = require("node:os") as typeof import("os");
	const tmpHome = pJoin(
		os.tmpdir(),
		`pi-context-write-fail-${Date.now()}`,
	);
	process.env.HOME = tmpHome;
	process.env.USERPROFILE = tmpHome; // Windows: os.homedir() 优先读 USERPROFILE
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

import { DISTILL_DIR, saveManifest, writeCachedMessages } from "../shared.js";

beforeAll(() => {
	// 不创建 DISTILL_DIR — 让测试自行控制
});

afterEach(() => {
	if (existsSync(DISTILL_DIR)) {
		// 恢复可写权限（以防测试设置了只读）
		try {
			rmSync(DISTILL_DIR, { recursive: true, force: true });
		} catch {
			/* cleanup best effort */
		}
	}
});

// ===== writeCachedMessages 写入失败 =====

describe("writeCachedMessages 写入失败时 console.warn", () => {
	it("DISTILL_DIR 是文件（非目录）时写入失败应 console.warn", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		// 在 DISTILL_DIR 路径上创建一个文件，阻塞 mkdirSync
		const parentDir = dirname(DISTILL_DIR);
		if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });
		writeFileSync(DISTILL_DIR, "blocker");

		// 调用，不应抛异常
		expect(() => writeCachedMessages([{ role: "user" }])).not.toThrow();

		// 应该 console.warn
		expect(warnSpy).toHaveBeenCalled();
		expect(warnSpy.mock.calls[0][0]).toContain("writeCachedMessages");

		// 清理
		rmSync(DISTILL_DIR, { force: true });
		warnSpy.mockRestore();
	});
});

// ===== saveManifest 写入失败 =====

describe("saveManifest 写入失败时 console.warn", () => {
	it("DISTILL_DIR 是文件时写入失败应 console.warn", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		// 在 DISTILL_DIR 路径上创建一个文件，阻塞 mkdirSync
		const parentDir = dirname(DISTILL_DIR);
		if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });
		writeFileSync(DISTILL_DIR, "blocker");

		// 调用，不应抛异常
		expect(() =>
			saveManifest("test-session", {
				manuallyDeleted: [],
				agingDeleted: [],
			}),
		).not.toThrow();

		// 应该 console.warn
		expect(warnSpy).toHaveBeenCalled();
		expect(warnSpy.mock.calls[0][0]).toContain("saveManifest");

		// 清理
		rmSync(DISTILL_DIR, { force: true });
		warnSpy.mockRestore();
	});
});
