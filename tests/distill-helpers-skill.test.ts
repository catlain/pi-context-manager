/**
 * distill-helpers isSkillFilePath 单元测试
 *
 * 注意：AGENT_DIR 是模块级常量（import 时求值），
 * 所以在 import 之前就要设好环境变量。
 */
import { afterAll, describe, expect, it } from "vitest";

const ORIG_PI_AGENT = process.env.PI_AGENT_DIR;

// 必须在 import distill-helpers 前设置 PI_AGENT_DIR
process.env.PI_AGENT_DIR = require("node:path").resolve("/home/user/.pi/agent");

const {
	isArchDocPath,
	isOpenspecDocPath,
	isSkillFilePath,
} = await import("../distill-helpers.js");

afterAll(() => {
	if (ORIG_PI_AGENT) process.env.PI_AGENT_DIR = ORIG_PI_AGENT;
	else delete process.env.PI_AGENT_DIR;
});

describe("isSkillFilePath", () => {
	it("undefined 路径返回 false", () => {
		expect(isSkillFilePath(undefined)).toBe(false);
	});

	it("空字符串返回 false", () => {
		expect(isSkillFilePath("")).toBe(false);
	});

	it("AGENT_DIR 外的路径返回 false", () => {
		expect(isSkillFilePath("/etc/passwd")).toBe(false);
	});

	it("相对路径 skills/ 内文件返回 true", () => {
		expect(isSkillFilePath("skills/code-graph/SKILL.md")).toBe(true);
	});

	it("npm 技能路径返回 true", () => {
		expect(isSkillFilePath("node_modules/pkg/skills/setup/SKILL.md")).toBe(
			true,
		);
	});

	it("AGENT_DIR 内但非 skills 的路径返回 false", () => {
		expect(isSkillFilePath("memory/foo.md")).toBe(false);
	});

	it("绝对路径匹配 skills/ 返回 true", () => {
		const p = require("node:path").join(
			process.env.PI_AGENT_DIR!,
			"skills/code-graph/SKILL.md",
		);
		expect(isSkillFilePath(p)).toBe(true);
	});

	it("绝对路径不匹配 skills/ 返回 false", () => {
		const p = require("node:path").join(
			process.env.PI_AGENT_DIR!,
			"memory/foo.md",
		);
		expect(isSkillFilePath(p)).toBe(false);
	});
});

describe("isOpenspecDocPath", () => {
	it("undefined 路径返回 false", () => {
		expect(isOpenspecDocPath(undefined)).toBe(false);
	});

	it("change 的 design.md 返回 true（相对路径）", () => {
		expect(
			isOpenspecDocPath("openspec/changes/retune-aging-exemptions/design.md"),
		).toBe(true);
	});

	it("change 的 design.md 返回 true（绝对路径）", () => {
		expect(
			isOpenspecDocPath(
				"/home/user/repo/openspec/changes/foo/design.md",
			),
		).toBe(true);
		expect(
			isOpenspecDocPath("C:\\repo\\openspec\\changes\\foo\\design.md"),
		).toBe(true);
	});

	it("change 的 proposal.md / tasks.md 返回 false（不再豁免）", () => {
		expect(
			isOpenspecDocPath("openspec/changes/foo/proposal.md"),
		).toBe(false);
		expect(isOpenspecDocPath("openspec/changes/foo/tasks.md")).toBe(false);
	});

	it("change 的增量 specs 返回 false（不再豁免）", () => {
		expect(
			isOpenspecDocPath("openspec/changes/foo/specs/bar/spec.md"),
		).toBe(false);
	});

	it("主规格 openspec/specs/ 返回 false（不再豁免）", () => {
		expect(isOpenspecDocPath("openspec/specs/aging/spec.md")).toBe(false);
		expect(isOpenspecDocPath("C:/repo/openspec/specs/foo/spec.md")).toBe(
			false,
		);
	});

	it("design.md 出现在别处不误匹配", () => {
		expect(isOpenspecDocPath("docs/design.md")).toBe(false);
		expect(isOpenspecDocPath("openspec/changes/design.md")).toBe(false);
	});

	it("左边界防护：myopenspec 不误匹配", () => {
		expect(
			isOpenspecDocPath("myopenspec/changes/foo/design.md"),
		).toBe(false);
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
