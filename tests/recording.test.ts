/**
 * recording.ts 单元测试
 *
 * 覆盖：isRecording, setRecording, cleanRecordings
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

vi.hoisted(() => {
	const { join: pJoin } = require("node:path") as typeof import("path");
	const os = require("node:os") as typeof import("os");
	process.env.HOME = pJoin(os.tmpdir(), `pi-recording-test-${Date.now()}`);
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

import {
	cleanRecordings,
	isRecording,
	RECORDINGS_DIR,
	setRecording,
} from "../recording.js";

beforeAll(() => {
	mkdirSync(RECORDINGS_DIR, { recursive: true });
});

beforeEach(() => {
	setRecording(false);
});

describe("isRecording / setRecording", () => {
	it("初始状态为 false", () => {
		expect(isRecording()).toBe(false);
	});

	it("设置为 true 后返回 true", () => {
		expect(setRecording(true)).toBe(true);
		expect(isRecording()).toBe(true);
	});

	it("切换回 false", () => {
		setRecording(true);
		setRecording(false);
		expect(isRecording()).toBe(false);
	});

	it("重复设置不报错", () => {
		setRecording(true);
		setRecording(true);
		expect(isRecording()).toBe(true);
	});
});

describe("cleanRecordings", () => {
	afterEach(() => {
		// 清理 recording 目录中剩余文件
		const entries = readdirSync(RECORDINGS_DIR);
		for (const e of entries) {
			rmSync(join(RECORDINGS_DIR, e), { recursive: true, force: true });
		}
	});

	it("目录为空时返回 0", () => {
		expect(cleanRecordings()).toBe(0);
	});

	it("删除文件并返回计数", () => {
		writeFileSync(join(RECORDINGS_DIR, "session1.jsonl"), "data", "utf-8");
		writeFileSync(join(RECORDINGS_DIR, "session2.jsonl"), "more", "utf-8");
		expect(cleanRecordings()).toBe(2);
		expect(readdirSync(RECORDINGS_DIR)).toHaveLength(0);
	});

	it("删除子目录", () => {
		const subDir = join(RECORDINGS_DIR, "sub");
		mkdirSync(subDir, { recursive: true });
		writeFileSync(join(subDir, "inner.jsonl"), "data", "utf-8");
		expect(cleanRecordings()).toBe(1);
		expect(readdirSync(RECORDINGS_DIR)).toHaveLength(0);
	});
});
