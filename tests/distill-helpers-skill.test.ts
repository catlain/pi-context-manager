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

const { isPlansFilePath, isSkillFilePath } = await import("../distill-helpers.js");

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

describe("isPlansFilePath", () => {
	it("undefined 路径返回 false", () => {
		expect(isPlansFilePath(undefined)).toBe(false);
	});

	it("空字符串返回 false", () => {
		expect(isPlansFilePath("")).toBe(false);
	});

	it("项目 .pi/plans/ 路径返回 true", () => {
		expect(isPlansFilePath(".pi/plans/E1.md")).toBe(true);
	});

	it("绝对路径 .pi/plans/ 返回 true", () => {
		expect(
			isPlansFilePath("/home/user/project/.pi/plans/E1-S1.md"),
		).toBe(true);
		expect(
			isPlansFilePath("C:\\Users\\dev\\project\\.pi\\plans\\E1.md"),
		).toBe(true);
	});

	it("非 plans 路径返回 false", () => {
		expect(isPlansFilePath(".pi/memory/foo.md")).toBe(false);
		expect(isPlansFilePath(".pi/settings.json")).toBe(false);
		expect(isPlansFilePath("src/index.ts")).toBe(false);
	});

	it("plans 一词在别处出现不误匹配", () => {
		expect(isPlansFilePath("src/plans/some.md")).toBe(false);
		expect(isPlansFilePath("myplans/file.md")).toBe(false);
	});
});
