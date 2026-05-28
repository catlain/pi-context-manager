/**
 * payload/files.ts 单元测试 — 文件列表部分
 *
 * 覆盖：listRecordingFiles, getRecordingFiles
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDir = vi.hoisted(() => "/fake/recordings");

const mockFs = vi.hoisted(() => ({
	existsSync: vi.fn(),
	readdirSync: vi.fn(),
}));

vi.mock("fs", () => mockFs);

vi.mock("../../payload/core.js", () => ({
	RECORDINGS_DIR: mockDir,
}));

const mockListSessions = vi.hoisted(() => vi.fn());

vi.mock("../../payload/files-core.js", () => ({
	listSessions: mockListSessions,
}));

import {
	listRecordingFiles,
	getRecordingFiles,
} from "../../payload/files.js";

// ══════════════════════════════════════════════════
// listRecordingFiles
// ══════════════════════════════════════════════════

describe("listRecordingFiles", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("目录不存在 → 返回 null", () => {
		mockFs.existsSync.mockReturnValue(false);
		expect(listRecordingFiles("/fake/nonexistent")).toBeNull();
	});

	it("目录存在但没有 req-*.json → 返回 null", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["other.json", "notes.txt"]);
		expect(listRecordingFiles("/fake/empty")).toBeNull();
	});

	it("目录下有序的 req-*.json → 返回排序后的列表", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue([
			"req-0003-ghi.json",
			"req-0001-abc.json",
			"req-0002-def.json",
		]);
		const files = listRecordingFiles("/fake/session");
		expect(files).toHaveLength(3);
		expect(files![0].filename).toBe("req-0001-abc.json");
		expect(files![1].filename).toBe("req-0002-def.json");
		expect(files![2].filename).toBe("req-0003-ghi.json");
	});
});

// ══════════════════════════════════════════════════
// getRecordingFiles
// ══════════════════════════════════════════════════

describe("getRecordingFiles", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("指定 sessionId → 查该会话目录下的文件", () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue([
			"req-0001-abc.json",
			"req-0002-def.json",
		]);
		const files = getRecordingFiles("session-a");
		expect(files).toHaveLength(2);
	});

	it("无 sessionId + 有多个会话 → 汇总所有文件", () => {
		mockListSessions.mockReturnValue([
			{ sessionId: "s1", fileCount: 2 },
			{ sessionId: "s2", fileCount: 1 },
		]);
		mockFs.existsSync.mockReturnValue(true);
		let callCount = 0;
		mockFs.readdirSync.mockImplementation(() => {
			callCount++;
			if (callCount === 1) return ["req-0001-a.json", "req-0002-b.json"];
			if (callCount === 2) return ["req-0001-c.json"];
			return [];
		});
		const all = getRecordingFiles();
		expect(all).toHaveLength(3);
	});

	it("无 sessionId + 有会话但都没有文件 → 返回 null", () => {
		mockListSessions.mockReturnValue([{ sessionId: "s1", fileCount: 0 }]);
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue([]);
		expect(getRecordingFiles()).toBeNull();
	});

	it("无 sessionId + 无会话 → fallback 到目录根层", () => {
		mockListSessions.mockReturnValue([]);
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["req-0001-legacy.json"]);
		const files = getRecordingFiles();
		expect(files).toHaveLength(1);
		expect(files![0].filename).toBe("req-0001-legacy.json");
	});

	it("无 sessionId + 无会话 + 根层也没有文件 → 返回 null", () => {
		mockListSessions.mockReturnValue([]);
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readdirSync.mockReturnValue(["other.txt"]);
		expect(getRecordingFiles()).toBeNull();
	});
});
