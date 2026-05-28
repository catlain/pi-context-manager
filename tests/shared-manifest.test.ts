/**
 * shared.ts 单元测试（Manifest 持久化）
 *
 * 覆盖：saveManifest, loadManifest
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { join } from "path";

vi.hoisted(() => {
	const { join: pJoin } = require("path") as typeof import("path");
	const os = require("os") as typeof import("os");
	process.env.HOME = pJoin(os.tmpdir(), "pi-context-manifest-" + Date.now());
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
	saveManifest,
	loadManifest,
	distilledMap,
	DISTILL_DIR,
} from "../shared.js";

beforeAll(() => {
	mkdirSync(DISTILL_DIR, { recursive: true });
});

const sid = "test-manifest-session";

beforeEach(() => {
	distilledMap.clear();
});

afterEach(() => {
	const sessionDir = join(DISTILL_DIR, sid);
	if (existsSync(sessionDir)) rmSync(sessionDir, { recursive: true });
});

describe("saveManifest", () => {
	it("写入蒸馏映射和删除列表", () => {
		distilledMap.set("k1", {
			toolName: "read",
			meta: "f.txt",
			tokens: 100,
			distilledAt: 12345,
		});
		saveManifest(sid, {
			manuallyDeleted: ["d1"],
			agingDeleted: ["a1"],
			agingCounts: [["k1", 3]],
		});

		const mp = join(DISTILL_DIR, sid, "manifest.json");
		expect(existsSync(mp)).toBe(true);
		const c = JSON.parse(readFileSync(mp, "utf-8"));
		expect(c.distilled).toHaveLength(1);
		expect(c.distilled[0][0]).toBe("k1");
		expect(c.manuallyDeleted).toEqual(["d1"]);
		expect(c.agingDeleted).toEqual(["a1"]);
		expect(c.agingCounts).toEqual([["k1", 3]]);
	});

	it("不传 agingCounts 时存空数组", () => {
		saveManifest(sid, { manuallyDeleted: [], agingDeleted: [] });
		const c = JSON.parse(
			readFileSync(join(DISTILL_DIR, sid, "manifest.json"), "utf-8"),
		);
		expect(c.agingCounts).toEqual([]);
	});

	it("空 sessionId 时写入全局路径", () => {
		saveManifest("", { manuallyDeleted: [], agingDeleted: [] });
		const gp = join(DISTILL_DIR, "manifest.json");
		expect(existsSync(gp)).toBe(true);
		rmSync(gp);
	});
});

describe("loadManifest", () => {
	it("恢复蒸馏映射和删除列表", () => {
		const data = {
			distilled: [
				[
					"sig1",
					{ toolName: "grep", meta: "f.txt", tokens: 50, distilledAt: 999 },
				],
			],
			manuallyDeleted: ["m1"],
			agingDeleted: ["a1"],
			agingCounts: [["sig1", 5]],
		};
		const dir = join(DISTILL_DIR, sid);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, "manifest.json"), JSON.stringify(data), "utf-8");

		const md = new Set<string>();
		const ad = new Set<string>();
		const at = new Map<string, number>();
		loadManifest(sid, { manuallyDeleted: md, agingDeleted: ad, agingTracker: at });

		expect(distilledMap.get("sig1")!.toolName).toBe("grep");
		expect(md.has("m1")).toBe(true);
		expect(ad.has("a1")).toBe(true);
		expect(at.get("sig1")).toBe(5);
	});

	it("文件不存在时不报错", () => {
		distilledMap.set("keep", { toolName: "x", meta: "x", tokens: 0, distilledAt: 0 });
		expect(() =>
			loadManifest("nonexistent", { manuallyDeleted: new Set(), agingDeleted: new Set() }),
		).not.toThrow();
		expect(distilledMap.has("keep")).toBe(true);
	});

	it("恢复 agingTracker", () => {
		const dir = join(DISTILL_DIR, sid);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "manifest.json"),
			JSON.stringify({
				distilled: [],
				manuallyDeleted: [],
				agingDeleted: [],
				agingCounts: [["s1", 3], ["s2", 7]],
			}),
			"utf-8",
		);

		const at = new Map<string, number>();
		loadManifest(sid, { manuallyDeleted: new Set(), agingDeleted: new Set(), agingTracker: at });
		expect(at.get("s1")).toBe(3);
		expect(at.get("s2")).toBe(7);
		expect(at.size).toBe(2);
	});
});
