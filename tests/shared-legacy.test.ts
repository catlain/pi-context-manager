import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// initLegacyManifest 直测：baseDir 注入临时目录，隔离真实 HOME 的 distill 数据
const TMP = mkdtempSync(join(tmpdir(), "pi-cm-legacy-"));

const { initLegacyManifest } = await import("../shared.js");

function put(rel: string, content: string) {
	const p = join(TMP, rel);
	mkdirSync(join(p, ".."), { recursive: true });
	writeFileSync(p, content);
}

describe("initLegacyManifest（遗留数据迁移，幂等）", () => {
	beforeAll(() => {
		rmSync(TMP, { recursive: true, force: true });
		mkdirSync(TMP, { recursive: true });
	});

	it("根目录孤儿 manifest.json 迁移至 anon/", () => {
		put(
			"manifest.json",
			JSON.stringify({ distilled: [["tc-1", 3]], agingDeleted: [] }),
		);
		initLegacyManifest(TMP);
		expect(existsSync(join(TMP, "manifest.json"))).toBe(false);
		expect(existsSync(join(TMP, "anon", "manifest.json"))).toBe(true);
	});

	it("recordings/unknown/ 迁移至 recordings/anon/", () => {
		put(join("recordings", "unknown", "req-0001-x.json"), "{}");
		initLegacyManifest(TMP);
		expect(existsSync(join(TMP, "recordings", "unknown"))).toBe(false);
		expect(
			existsSync(join(TMP, "recordings", "anon", "req-0001-x.json")),
		).toBe(true);
	});

	it("anon manifest 已存在时根目录孤儿不覆盖（保留）", () => {
		put("manifest.json", JSON.stringify({ distilled: [["legacy", 1]] }));
		put(
			join("anon", "manifest.json"),
			JSON.stringify({ distilled: [["kept", 2]] }),
		);
		initLegacyManifest(TMP);
		expect(existsSync(join(TMP, "manifest.json"))).toBe(true);
		expect(existsSync(join(TMP, "anon", "manifest.json"))).toBe(true);
	});

	it("无遗留数据时幂等不崩", () => {
		rmSync(TMP, { recursive: true, force: true });
		mkdirSync(TMP, { recursive: true });
		expect(() => initLegacyManifest(TMP)).not.toThrow();
		expect(() => initLegacyManifest(TMP)).not.toThrow();
	});

	afterAll(() => {
		rmSync(TMP, { recursive: true, force: true });
	});
});
