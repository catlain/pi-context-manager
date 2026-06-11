/**
 * shared.ts 单元测试（消息/payload 缓存文件操作）
 *
 * 覆盖：readCachedMessages, writeCachedMessages, readCachedPayload
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
	const { join: pJoin } = require("node:path") as typeof import("path");
	const os = require("node:os") as typeof import("os");
	const tmpHome = pJoin(os.tmpdir(), `pi-context-cache-${Date.now()}`);
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

import {
	DISTILL_DIR,
	MSG_CACHE,
	PAYLOAD_CACHE,
	readCachedMessages,
	readCachedPayload,
	writeCachedMessages,
} from "../shared.js";

beforeAll(() => {
	mkdirSync(DISTILL_DIR, { recursive: true });
});

// ===== readCachedMessages =====

describe("readCachedMessages", () => {
	it("文件不存在时返回空数组", () => {
		expect(readCachedMessages()).toEqual([]);
	});

	it("有效 JSON 数组时返回数据", () => {
		const data = [{ role: "user" }, { role: "assistant" }];
		writeFileSync(MSG_CACHE, JSON.stringify(data), "utf-8");
		const r = readCachedMessages();
		expect(r).toHaveLength(2);
		expect(r[0].role).toBe("user");
		rmSync(MSG_CACHE);
	});

	it("文件存在但不是数组时返回空数组", () => {
		writeFileSync(MSG_CACHE, '{"not":"array"}', "utf-8");
		expect(readCachedMessages()).toEqual([]);
		rmSync(MSG_CACHE);
	});

	it("无效 JSON 时返回空数组", () => {
		writeFileSync(MSG_CACHE, "not json", "utf-8");
		expect(readCachedMessages()).toEqual([]);
		rmSync(MSG_CACHE);
	});
});

// ===== writeCachedMessages =====

describe("writeCachedMessages", () => {
	it("写入 JSON 文件", () => {
		const msgs = [{ role: "user", content: "hi" }];
		writeCachedMessages(msgs);
		const content = readFileSync(MSG_CACHE, "utf-8");
		expect(JSON.parse(content)).toEqual(msgs);
		rmSync(MSG_CACHE);
	});

	it("写入空数组", () => {
		writeCachedMessages([]);
		const content = readFileSync(MSG_CACHE, "utf-8");
		expect(JSON.parse(content)).toEqual([]);
		rmSync(MSG_CACHE);
	});
});

// ===== readCachedPayload =====

describe("readCachedPayload", () => {
	it("文件不存在时返回 null", () => {
		expect(readCachedPayload()).toBeNull();
	});

	it("文件存在时返回解析的 JSON", () => {
		const data = { model: "gpt-4", messages: [] };
		writeFileSync(PAYLOAD_CACHE, JSON.stringify(data), "utf-8");
		expect(readCachedPayload()).toEqual(data);
		rmSync(PAYLOAD_CACHE);
	});

	it("无效 JSON 时返回 null", () => {
		writeFileSync(PAYLOAD_CACHE, "bad json", "utf-8");
		expect(readCachedPayload()).toBeNull();
		rmSync(PAYLOAD_CACHE);
	});
});
