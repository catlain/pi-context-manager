/**
 * payload/files-core.ts 单元测试
 *
 * 覆盖：listSessions, listRecordings
 * Mock fs 函数，模拟 RECORDINGS_DIR 下的目录和文件结构。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDir = vi.hoisted(() => "/fake/recordings");

// ── Mock fs ──────────────────────────────────────

const mockFs = vi.hoisted(() => ({
	existsSync: vi.fn(),
	readdirSync: vi.fn(),
	statSync: vi.fn(),
	readFileSync: vi.fn(),
}));

vi.mock("fs", () => mockFs);

vi.mock("../../payload/core.js", () => ({
	RECORDINGS_DIR: mockDir,
	estTokens: vi.fn(),
	fmtTok: vi.fn(),
	getText: vi.fn(),
	readJsonFile: vi.fn(),
}));

import { listSessions, listRecordings } from "../../payload/files-core.js";

// ══════════════════════════════════════════════════
// listSessions
// ══════════════════════════════════════════════════

describe("listSessions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("RECORDINGS_DIR 不存在 → 返回空数组", () => {
		mockFs.existsSync.mockReturnValue(false);
		expect(listSessions()).toEqual([]);
	});

	it("目录下没有会话目录 → 返回空数组", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["req-0001-abc.json"]);
		// 返回普通文件，不是目录
		// 只调用一次 readdirSync（外层）并全是普通文件
		// 因为每个 entry 是文件不是目录，所以不会进入内层
		expect(listSessions()).toEqual([]);
	});

	it("目录下只有目录但没有 req-*.json → 跳过", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockImplementation((p: string) => {
			if (p === mockDir) {
				return ["session-abc"];
			}
			if (p === "/fake/recordings/session-abc") {
				return ["other.json"]; // 没有 req-* 文件
			}
			return [];
		});
		mockFs.statSync.mockReturnValue({ isDirectory: () => true });
		expect(listSessions()).toEqual([]);
	});

	it("正常出现会话列表", () => {
		mockFs.existsSync.mockReturnValue(true);
		// 外层 readdirSync：列目录项
		// 内层 readdirSync：列每个目录下的 req-* 文件
		let callCount = 0;
		mockFs.readdirSync.mockImplementation((p: string) => {
			callCount++;
			if (p === mockDir) {
				return ["session-a", "session-b"];
			}
			if (p === "/fake/recordings/session-a") {
				return [
					"req-0001-100000.123.json",
					"req-0002-100001.456.json",
				];
			}
			if (p === "/fake/recordings/session-b") {
				return ["req-0001-100002.789.json"];
			}
			return [];
		});
		mockFs.statSync.mockReturnValue({ isDirectory: () => true });
		mockFs.readFileSync.mockImplementation((p: string) => {
			if (p === "/fake/recordings/session-a/req-0001-100000.123.json") {
				return JSON.stringify({ model: "gpt-4" });
			}
			return JSON.stringify({ model: "claude-3" });
		});

		const sessions = listSessions();
		expect(sessions).toHaveLength(2);
		expect(sessions[0].sessionId).toBe("session-a");
		expect(sessions[0].fileCount).toBe(2);
		expect(sessions[0].model).toBe("gpt-4");
		expect(sessions[1].sessionId).toBe("session-b");
		expect(sessions[1].fileCount).toBe(1);
		expect(sessions[1].model).toBe("claude-3");
	});

	it("statSync 抛异常 → 跳过该 entry", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockImplementation((p: string) => {
			if (p === mockDir) return ["bad-entry", "good-session"];
			if (p === "/fake/recordings/good-session") {
				return ["req-0001-abc.json"];
			}
			return [];
		});
		mockFs.statSync.mockImplementation((p: string) => {
			if (p === "/fake/recordings/bad-entry") throw new Error("permission");
			return { isDirectory: () => true, size: 100 };
		});
		mockFs.readFileSync.mockReturnValue(
			JSON.stringify({ model: "gpt-4" }),
		);
		const sessions = listSessions();
		expect(sessions).toHaveLength(1);
		expect(sessions[0].sessionId).toBe("good-session");
	});

	it("读文件时抛异常 → model 为 ?", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockImplementation((p: string) => {
			if (p === mockDir) return ["session-x"];
			if (p === "/fake/recordings/session-x") {
				return ["req-0001-abc.json"];
			}
			return [];
		});
		mockFs.statSync.mockReturnValue({ isDirectory: () => true, size: 50 });
		mockFs.readFileSync.mockImplementation(() => {
			throw new Error("corrupt");
		});
		const sessions = listSessions();
		expect(sessions).toHaveLength(1);
		expect(sessions[0].model).toBe("?");
	});
});

// ══════════════════════════════════════════════════
// listRecordings
// ══════════════════════════════════════════════════

describe("listRecordings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("RECORDINGS_DIR 不存在 → 返回空数组", () => {
		mockFs.existsSync.mockReturnValue(false);
		expect(listRecordings()).toEqual([]);
	});

	it("无会话目录 → 返回空数组", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue([]);
		expect(listRecordings()).toEqual([]);
	});

	it("指定 sessionId → 只返回该会话文件", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockImplementation((p: string) => {
			if (p === "/fake/recordings/session-a") {
				return [
					"req-0001-abc.json",
					"req-0002-def.json",
				];
			}
			return [];
		});
		mockFs.statSync.mockReturnValue({ size: 42 });
		mockFs.readFileSync.mockReturnValue(
			JSON.stringify({ model: "claude-3", messages: [{ role: "user" }] }),
		);
		const recordings = listRecordings("session-a");
		expect(recordings).toHaveLength(2);
		expect(recordings[0].sessionId).toBe("session-a");
		expect(recordings[0].model).toBe("claude-3");
	});

	it("收集所有会话文件（多会话）", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockImplementation((p: string) => {
			if (p === mockDir) return ["session-a", "session-b"];
			if (p === "/fake/recordings/session-a") {
				return ["req-0001-abc.json"];
			}
			if (p === "/fake/recordings/session-b") {
				return ["req-0001-def.json"];
			}
			return [];
		});
		mockFs.statSync.mockReturnValue({ isDirectory: () => true, size: 30 });
		mockFs.readFileSync.mockReturnValue(
			JSON.stringify({ model: "gpt-4", messages: [] }),
		);
		const all = listRecordings();
		expect(all).toHaveLength(2);
	});

	it("读取文件抛异常 → 捕获并返回安全对象", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockImplementation((p: string) => {
			if (p === "/fake/recordings/session-x") {
				return ["req-0001-bad.json"];
			}
			if (p === mockDir) return ["session-x"];
			return [];
		});
		mockFs.statSync.mockReturnValue({ isDirectory: () => true, size: 0 });
		mockFs.readFileSync.mockImplementation(() => {
			throw new Error("corrupt");
		});
		const all = listRecordings();
		expect(all).toHaveLength(1);
		expect(all[0].reqNum).toBe("0001");
		expect(all[0].model).toBe("?");
		expect(all[0].size).toBe(0);
	});
});
