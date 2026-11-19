/**
 * shared.ts 单元测试（消息/payload 缓存文件操作，per-session 隔离布局）
 *
 * 覆盖：readCachedMessages, writeCachedMessages, readCachedPayload, getCachePath
 */

import { dirname } from "node:path";
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
	getCachePath,
	readCachedMessages,
	readCachedPayload,
	writeCachedMessages,
} from "../shared.js";

const SID = "test-session-12345678";
const MSG_CACHE = getCachePath(SID, "last-messages.json");
const PAYLOAD_CACHE = getCachePath(SID, "last-payload.json");

beforeAll(() => {
	mkdirSync(DISTILL_DIR, { recursive: true });
	mkdirSync(dirname(MSG_CACHE), { recursive: true }); // per-session 目录
});

// ===== getCachePath =====

describe("getCachePath", () => {
	it("定位到 distill/<sid>/ 下（per-session 隔离）", () => {
		const p = getCachePath("abc-12345678", "last-payload.json");
		expect(p).toContain("abc-12345678");
		expect(p.endsWith("last-payload.json")).toBe(true);
	});

	it("空 sid 落 anon/（沿 ADR-010，不污染根目录）", () => {
		const p = getCachePath("", "last-payload.json");
		expect(p).toContain("anon");
		expect(p).not.toContain("last-payload.json" + "anon"); // 病态拼接防御
	});
});

// ===== readCachedMessages =====

describe("readCachedMessages", () => {
	it("文件不存在时返回空数组", () => {
		expect(readCachedMessages(SID)).toEqual([]);
	});

	it("有效 JSON 数组时返回数据", () => {
		const data = [{ role: "user" }, { role: "assistant" }];
		writeFileSync(MSG_CACHE, JSON.stringify(data), "utf-8");
		const r = readCachedMessages(SID);
		expect(r).toHaveLength(2);
		expect(r[0].role).toBe("user");
		rmSync(MSG_CACHE);
	});

	it("文件存在但不是数组时返回空数组", () => {
		writeFileSync(MSG_CACHE, '{"not":"array"}', "utf-8");
		expect(readCachedMessages(SID)).toEqual([]);
		rmSync(MSG_CACHE);
	});

	it("无效 JSON 时返回空数组", () => {
		writeFileSync(MSG_CACHE, "not json", "utf-8");
		expect(readCachedMessages(SID)).toEqual([]);
		rmSync(MSG_CACHE);
	});

	it("不同 sid 的缓存互不可见（隔离）", () => {
		writeCachedMessages(SID, [{ role: "user", content: "mine" }]);
		const other = "other-session-87654321";
		expect(readCachedMessages(other)).toEqual([]);
		rmSync(MSG_CACHE);
	});
});

// ===== writeCachedMessages =====

describe("writeCachedMessages", () => {
	it("写入 JSON 文件", () => {
		const msgs = [{ role: "user", content: "hi" }];
		writeCachedMessages(SID, msgs);
		const content = readFileSync(MSG_CACHE, "utf-8");
		expect(JSON.parse(content)).toEqual(msgs);
		rmSync(MSG_CACHE);
	});

	it("写入空数组", () => {
		writeCachedMessages(SID, []);
		const content = readFileSync(MSG_CACHE, "utf-8");
		expect(JSON.parse(content)).toEqual([]);
		rmSync(MSG_CACHE);
	});
});

// ===== readCachedPayload =====

describe("readCachedPayload", () => {
	it("文件不存在时返回 null", () => {
		expect(readCachedPayload(SID)).toBeNull();
	});

	it("文件存在时返回解析的 JSON", () => {
		const data = { model: "gpt-4", messages: [] };
		writeFileSync(PAYLOAD_CACHE, JSON.stringify(data), "utf-8");
		expect(readCachedPayload(SID)).toEqual(data);
		rmSync(PAYLOAD_CACHE);
	});

	it("无效 JSON 时返回 null", () => {
		writeFileSync(PAYLOAD_CACHE, "bad json", "utf-8");
		expect(readCachedPayload(SID)).toBeNull();
		rmSync(PAYLOAD_CACHE);
	});

	it("读取他 sid 写入的 payload 得 null（隔离核心不变量）", () => {
		writeFileSync(PAYLOAD_CACHE, JSON.stringify({ model: "x" }), "utf-8");
		expect(readCachedPayload("other-session-87654321")).toBeNull();
		rmSync(PAYLOAD_CACHE);
	});
});
