/**
 * migrateLegacyProcessorFiles 迁移测试
 * 验证：删除 processor/ 根目录散落文件（旧格式）、保留子目录（新结构）、幂等
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
	process.env.HOME = pJoin(os.tmpdir(), `pi-migrate-test-${Date.now()}`);
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

import { migrateLegacyProcessorFiles } from "../clean.js";
import { DISTILL_DIR } from "../shared.js";

const PROCESSOR_DIR = join(DISTILL_DIR, "processor");

beforeAll(() => mkdirSync(DISTILL_DIR, { recursive: true }));
beforeEach(() => {
	if (existsSync(DISTILL_DIR)) {
		for (const e of readdirSync(DISTILL_DIR))
			rmSync(join(DISTILL_DIR, e), { recursive: true, force: true });
	}
});

describe("migrateLegacyProcessorFiles", () => {
	it("删除根目录散落文件（旧 writeRaw + toolcall 格式）", () => {
		mkdirSync(PROCESSOR_DIR, { recursive: true });
		writeFileSync(join(PROCESSOR_DIR, "bash-2ddbef95-1786420098830.txt"), "old");
		writeFileSync(
			join(PROCESSOR_DIR, "toolcall-aaaa1111-1786420099999.txt"),
			"old",
		);
		const removed = migrateLegacyProcessorFiles();
		expect(removed).toBe(2);
		expect(readdirSync(PROCESSOR_DIR)).toEqual([]);
	});

	it("保留子目录（新结构 processor/<sid>/）", () => {
		mkdirSync(PROCESSOR_DIR, { recursive: true });
		writeFileSync(join(PROCESSOR_DIR, "read-old-789.txt"), "old");
		const sub = join(PROCESSOR_DIR, "019feeed-5337-747e-91b2-32042ddbef95");
		mkdirSync(sub, { recursive: true });
		writeFileSync(join(sub, "bash-111.txt"), "new");
		const removed = migrateLegacyProcessorFiles();
		expect(removed).toBe(1); // 只删了 1 个根目录散落文件
		expect(existsSync(sub)).toBe(true); // 子目录保留
		expect(readdirSync(sub)).toHaveLength(1);
	});

	it("processor 目录不存在时返回 0", () => {
		expect(migrateLegacyProcessorFiles()).toBe(0);
	});

	it("幂等：再次调用无散落文件可删", () => {
		mkdirSync(PROCESSOR_DIR, { recursive: true });
		writeFileSync(join(PROCESSOR_DIR, "old-1.txt"), "x");
		expect(migrateLegacyProcessorFiles()).toBe(1);
		expect(migrateLegacyProcessorFiles()).toBe(0);
	});
});
