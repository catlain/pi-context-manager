/**
 * distill-helpers isSkillMdPath 单元测试（项目级/全局/npm 技能路径）
 *
 * 注意：AGENT_DIR 是模块级常量（import 时求值），
 * 所以在 import 之前就要设好环境变量。
 */
import { afterAll, describe, expect, it } from "vitest";

const ORIG_PI_AGENT = process.env.PI_AGENT_DIR;

// 必须在 import distill-helpers 前设置 PI_AGENT_DIR
process.env.PI_AGENT_DIR = require("node:path").resolve("/home/user/.pi/agent");

const {
	isSkillMdPath,
} = await import("../distill-helpers.js");

afterAll(() => {
	if (ORIG_PI_AGENT) process.env.PI_AGENT_DIR = ORIG_PI_AGENT;
	else delete process.env.PI_AGENT_DIR;
});

describe("isSkillMdPath", () => {
	it("undefined 路径返回 false", () => {
		expect(isSkillMdPath(undefined)).toBe(false);
	});

	it("空字符串返回 false", () => {
		expect(isSkillMdPath("")).toBe(false);
	});

	it("AGENT_DIR 外的路径返回 false", () => {
		expect(isSkillMdPath("/etc/passwd")).toBe(false);
	});

	it("相对路径 skills/ 内文件返回 true", () => {
		expect(isSkillMdPath("skills/code-graph/SKILL.md")).toBe(true);
	});

	it("npm 技能路径返回 true", () => {
		expect(isSkillMdPath("node_modules/pkg/skills/setup/SKILL.md")).toBe(
			true,
		);
	});

	it("AGENT_DIR 内但非 skills 的路径返回 false", () => {
		expect(isSkillMdPath("memory/foo.md")).toBe(false);
	});

	it("项目级技能 .pi/skills/（绝对路径）返回 true", () => {
		expect(
			isSkillMdPath("D:/Project/Quant/.pi/skills/field-lineage/SKILL.md"),
		).toBe(true);
	});

	it("项目级技能 .pi/skills/（相对路径）返回 true", () => {
		expect(isSkillMdPath(".pi/skills/field-lineage/SKILL.md")).toBe(
			true,
		);
	});

	it("项目级技能 .pi/skills/（反斜杠路径）返回 true", () => {
		expect(
			isSkillMdPath(
				"D:\\Project\\Quant\\.pi\\skills\\field-lineage\\SKILL.md",
			),
		).toBe(true);
	});

	it("非 C 盘绝对路径不被误判（无盘符硬编码）", () => {
		// 旧实现 startsWith("C:") 硬编码的历史回归；新谓词无盘符依赖，
		// D 盘任意 skills 目录树同样正确命中（任意目录树语义）
		expect(isSkillMdPath("D:/proj/skills/foo/SKILL.md")).toBe(true);
		expect(isSkillMdPath("D:/proj/.pi/skills/foo/SKILL.md")).toBe(true);
	});

	it("非 .pi 树 skills 目录（业务/.agents/git 包）也命中（任意目录树语义）", () => {
		// 用户拍板“任意 skills 目录都收”：D:/proj/skills/、/opt/x/skills/、
		// .agents/skills/ 等非 .pi 树形态统一命中
		expect(isSkillMdPath("D:/proj/skills/foo/SKILL.md")).toBe(true);
		expect(isSkillMdPath("/opt/x/skills/foo/SKILL.md")).toBe(true);
		expect(isSkillMdPath("C:/Users/u/.agents/skills/skill-creator/SKILL.md")).toBe(
			true,
		);
	});

	it("大小写异写仍豁免", () => {
		expect(isSkillMdPath(".PI/skills/foo/SKILL.MD")).toBe(true);
		expect(isSkillMdPath("D:/proj/.pi/Skills/foo/Skill.md")).toBe(true);
	});

	it("绝对路径匹配 skills/ 返回 true", () => {
		const p = require("node:path").join(
			process.env.PI_AGENT_DIR!,
			"skills/code-graph/SKILL.md",
		);
		expect(isSkillMdPath(p)).toBe(true);
	});

	it("绝对路径不匹配 skills/ 返回 false", () => {
		const p = require("node:path").join(
			process.env.PI_AGENT_DIR!,
			"memory/foo.md",
		);
		expect(isSkillMdPath(p)).toBe(false);
	});
});

