/**
 * processor 原文写入路径测试（raw-writer + toolcall-args-truncator）
 * 验证：完整 sessionId 分目录结构、不同会话隔离、无 sessionId 走 anon 子目录
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	const { join: pJoin } = require("node:path") as typeof import("path");
	const os = require("node:os") as typeof import("os");
	process.env.HOME = pJoin(os.tmpdir(), `pi-proc-write-test-${Date.now()}`);
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

import { PROCESSOR_DIR, writeRawToFile } from "../raw-writer.js";
import { DISTILL_DIR } from "../shared.js";
import {
	bigStr,
	makeMessages,
	truncateToolCallArgs,
} from "./toolcall-args-helpers.js";

beforeAll(() => mkdirSync(DISTILL_DIR, { recursive: true }));
beforeEach(() => {
	if (existsSync(DISTILL_DIR)) {
		for (const e of readdirSync(DISTILL_DIR))
			rmSync(join(DISTILL_DIR, e), { recursive: true, force: true });
	}
});

describe("writeRawToFile — 完整 sessionId 分目录", () => {
	it("有 sessionId 时写到 processor/<sid>/ 子目录", () => {
		const sid = "019feeed-5337-747e-91b2-32042ddbef95";
		const path = writeRawToFile("body", "bash", false, null, { a: 1 }, "tc-1", sid);
		expect(path).toBeTruthy();
		expect(path).toContain(sid);
		expect(path).toMatch(/[\\/]bash-\d+\.txt$/);
		const dir = join(PROCESSOR_DIR, sid);
		expect(readdirSync(dir)).toHaveLength(1);
		expect(readFileSync(path!, "utf-8")).toContain("=== bash ===");
	});

	it("无 sessionId 时写到 processor/anon/ 子目录（不污染根目录）", () => {
		const path = writeRawToFile("body", "bash", false);
		expect(path).toContain("anon");
		const entries = readdirSync(PROCESSOR_DIR, { withFileTypes: true });
		expect(entries.every((e) => e.isDirectory())).toBe(true);
		expect(entries.some((e) => e.name === "anon")).toBe(true);
	});

	it("不同 sessionId 写入各自子目录（隔离）", () => {
		writeRawToFile("a", "bash", false, null, {}, "tc-1", "sid-aaa-111");
		writeRawToFile("b", "bash", false, null, {}, "tc-2", "sid-bbb-222");
		expect(existsSync(join(PROCESSOR_DIR, "sid-aaa-111"))).toBe(true);
		expect(existsSync(join(PROCESSOR_DIR, "sid-bbb-222"))).toBe(true);
	});

	it("writeFallback 模拟失败返回 null", () => {
		expect(writeRawToFile("x", "t", true)).toBeNull();
	});
});

describe("truncateToolCallArgs — 完整 sessionId 分目录", () => {
	it("带 sessionId 时写到 processor/<sid>/ 子目录", () => {
		const sid = "019feeed-5337-747e-91b2-32042ddbef95";
		const messages = makeMessages([
			{ id: "tc-abc", name: "write", args: { content: bigStr(3000) } },
		]);
		const count = truncateToolCallArgs(messages, 1000, new Set(), sid);
		expect(count).toBe(1);
		const block = messages[0].content[0];
		expect(block.arguments._truncated).toBe(true);
		expect(block.arguments.summary).toContain(sid); // summary 含 tmpPath
		expect(existsSync(join(PROCESSOR_DIR, sid))).toBe(true);
		expect(readdirSync(join(PROCESSOR_DIR, sid))[0]).toContain("tc-abc");
	});

	it("无 sessionId 时写到 processor/anon/ 子目录", () => {
		const messages = makeMessages([
			{ id: "tc-x", name: "write", args: { content: bigStr(3000) } },
		]);
		truncateToolCallArgs(messages, 1000, new Set());
		const block = messages[0].content[0];
		expect(block.arguments.summary).toContain("anon");
		expect(existsSync(join(PROCESSOR_DIR, "anon"))).toBe(true);
	});
});
