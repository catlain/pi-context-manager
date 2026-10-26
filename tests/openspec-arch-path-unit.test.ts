/**
 * 路径豁免单元测试：isOpenspecDesignPath / isArchDocPath
 * （技能文件路径判断见 distill-helpers-skill.test.ts）
 */
import { describe, expect, it } from "vitest";
import {
	isArchDocPath,
	isOpenspecDesignPath,
} from "../distill-helpers.js";

describe("isOpenspecDesignPath", () => {
	it("undefined 路径返回 false", () => {
		expect(isOpenspecDesignPath(undefined)).toBe(false);
	});

	it("change 的 design.md 返回 true（相对路径）", () => {
		expect(
			isOpenspecDesignPath("openspec/changes/retune-aging-exemptions/design.md"),
		).toBe(true);
	});

	it("change 的 design.md 返回 true（绝对路径）", () => {
		expect(
			isOpenspecDesignPath(
				"/home/user/repo/openspec/changes/foo/design.md",
			),
		).toBe(true);
		expect(
			isOpenspecDesignPath("C:\\repo\\openspec\\changes\\foo\\design.md"),
		).toBe(true);
	});

	it("change 的 proposal.md / tasks.md 返回 false（不再豁免）", () => {
		expect(
			isOpenspecDesignPath("openspec/changes/foo/proposal.md"),
		).toBe(false);
		expect(isOpenspecDesignPath("openspec/changes/foo/tasks.md")).toBe(false);
	});

	it("change 的增量 specs 返回 false（不再豁免）", () => {
		expect(
			isOpenspecDesignPath("openspec/changes/foo/specs/bar/spec.md"),
		).toBe(false);
	});

	it("主规格 openspec/specs/ 返回 false（不再豁免）", () => {
		expect(isOpenspecDesignPath("openspec/specs/aging/spec.md")).toBe(false);
		expect(isOpenspecDesignPath("C:/repo/openspec/specs/foo/spec.md")).toBe(
			false,
		);
	});

	it("design.md 出现在别处不误匹配", () => {
		expect(isOpenspecDesignPath("docs/design.md")).toBe(false);
		expect(isOpenspecDesignPath("openspec/changes/design.md")).toBe(false);
	});

	it("左边界防护：myopenspec 不误匹配", () => {
		expect(
			isOpenspecDesignPath("myopenspec/changes/foo/design.md"),
		).toBe(false);
	});

	it("大小写异写仍豁免", () => {
		expect(
			isOpenspecDesignPath("openspec/changes/foo/Design.md"),
		).toBe(true);
		expect(
			isOpenspecDesignPath("OpenSpec/Changes/foo/DESIGN.MD"),
		).toBe(true);
	});
});

describe("isArchDocPath", () => {
	it("undefined 路径返回 false", () => {
		expect(isArchDocPath(undefined)).toBe(false);
	});

	it("docs/agent/adr/ 目录（INDEX 与编号 ADR）返回 true", () => {
		expect(isArchDocPath("docs/agent/adr/INDEX.md")).toBe(true);
		expect(
			isArchDocPath(
				"docs/agent/adr/0390-ic-single-substrate-dual-view.md",
			),
		).toBe(true);
		expect(
			isArchDocPath(
				"D:\\Project\\Quant\\docs\\agent\\adr\\0100-foo.md",
			),
		).toBe(true);
	});

	it("docs/agent/adr-archive/ 归档 ADR 返回 true", () => {
		expect(isArchDocPath("docs/agent/adr-archive/0368-xxx.md")).toBe(true);
	});

	it("单文件形态 docs/agent/ADR.md 返回 true", () => {
		expect(isArchDocPath("docs/agent/ADR.md")).toBe(true);
		expect(isArchDocPath("C:\\repo\\docs\\agent\\ADR.md")).toBe(true);
	});

	it("docs/agent/INVARIANTS.md 返回 true", () => {
		expect(isArchDocPath("docs/agent/INVARIANTS.md")).toBe(true);
		expect(isArchDocPath("/repo/docs/agent/INVARIANTS.md")).toBe(true);
	});

	it("docs/agent/designs/ Design Note 返回 true", () => {
		expect(isArchDocPath("docs/agent/designs/回测引擎.md")).toBe(true);
		expect(isArchDocPath("docs/agent/designs/README.md")).toBe(true);
	});

	it("docs/agent 前缀外同名文件不误匹配", () => {
		expect(isArchDocPath("results/designs/x.md")).toBe(false);
		expect(isArchDocPath("docs/ADR.md")).toBe(false);
		expect(isArchDocPath("ADR.md")).toBe(false);
		expect(isArchDocPath("src/adr/foo.md")).toBe(false);
	});

	it("docs/agent 下非宪法文件不误匹配", () => {
		expect(isArchDocPath("docs/agent/ARCHITECTURE.md")).toBe(false);
	});
});
