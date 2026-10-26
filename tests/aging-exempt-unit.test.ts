/**
 * 纯函数单元测试：isAgingExempt（豁免组装层）
 *
 * 直接测 distill-helpers.ts 导出的纯函数，不走 handleContextEvent 集成路径。
 * selectAgingThreshold 见 select-aging-threshold-unit.test.ts。
 */
import { describe, expect, it } from "vitest";
import { type AgingContext, isAgingExempt } from "../distill-helpers.js";

const ctx = (o: Partial<AgingContext> = {}): AgingContext => ({
	toolName: "bash",
	isError: false,
	tokens: 100,
	filePath: undefined,
	...o,
});

const AGENT_DIR =
	process.env.PI_AGENT_DIR ||
	require("node:path").join(process.env.HOME || "/root", ".pi", "agent");

// ════════════════════════════════════════
// isAgingExempt
// ════════════════════════════════════════
describe("isAgingExempt", () => {
	it("read skill 文件 → true", () => {
		expect(
			isAgingExempt(
				ctx({
					toolName: "read",
					filePath: `${AGENT_DIR}/skills/code-graph/SKILL.md`,
				}),
			),
		).toBe(true);
	});

	it("read npm skill 文件 → true", () => {
		expect(
			isAgingExempt(
				ctx({
					toolName: "read",
					filePath: `${AGENT_DIR}/npm/node_modules/pi-agent-codebase-workflows/skills/safe-change/SKILL.md`,
				}),
			),
		).toBe(true);
	});

	it("read .pi/plans/ 计划文档 → false（不再豁免，走普通 aging）", () => {
		expect(
			isAgingExempt(
				ctx({ toolName: "read", filePath: "/project/.pi/plans/E1.md" }),
			),
		).toBe(false);
	});

	it("read 普通文件 → false", () => {
		expect(
			isAgingExempt(ctx({ toolName: "read", filePath: "/home/x/src.ts" })),
		).toBe(false);
	});

	it("read openspec change 的 design.md（相对路径）→ true", () => {
		expect(
			isAgingExempt(
				ctx({
					toolName: "read",
					filePath: "openspec/changes/retune-aging-exemptions/design.md",
				}),
			),
		).toBe(true);
	});

	it("read openspec change 的 design.md（反斜杠路径）→ true", () => {
		expect(
			isAgingExempt(
				ctx({
					toolName: "read",
					filePath:
						"C:\\repo\\openspec\\changes\\foo\\design.md",
				}),
			),
		).toBe(true);
	});

	it("read openspec change 的 proposal/tasks → false（不再豁免）", () => {
		expect(
			isAgingExempt(
				ctx({
					toolName: "read",
					filePath: "openspec/changes/foo/proposal.md",
				}),
			),
		).toBe(false);
		expect(
			isAgingExempt(
				ctx({ toolName: "read", filePath: "openspec/changes/foo/tasks.md" }),
			),
		).toBe(false);
	});

	it("read openspec change 的增量 specs → false（不再豁免）", () => {
		expect(
			isAgingExempt(
				ctx({
					toolName: "read",
					filePath:
						"C:/repo/openspec/changes/foo/specs/bar/spec.md",
				}),
			),
		).toBe(false);
	});

	it("read openspec 主规格 specs/ → false（不再豁免）", () => {
		expect(
			isAgingExempt(
				ctx({
					toolName: "read",
					filePath: "openspec/specs/aging-exemption/spec.md",
				}),
			),
		).toBe(false);
		expect(
			isAgingExempt(
				ctx({
					toolName: "read",
					filePath: "C:\\repo\\openspec\\specs\\foo\\spec.md",
				}),
			),
		).toBe(false);
	});

	it("read openspec 根下非 changes 文档 → false（豁免仅限 change design.md）", () => {
		expect(
			isAgingExempt(
				ctx({
					toolName: "read",
					filePath: "openspec/AGENTS.md",
				}),
			),
		).toBe(false);
	});

	it("edit openspec 变更文档路径 → false（edit 走策略选择不豁免）", () => {
		expect(
			isAgingExempt(
				ctx({
					toolName: "edit",
					filePath: "openspec/changes/foo/design.md",
				}),
			),
		).toBe(false);
	});

	it("write openspec 变更文档路径 → false（write 走策略选择不豁免）", () => {
		expect(
			isAgingExempt(
				ctx({
					toolName: "write",
					filePath: "openspec/changes/foo/tasks.md",
				}),
			),
		).toBe(false);
	});

	it("edit → false（不走完全豁免，走策略选择）", () => {
		expect(isAgingExempt(ctx({ toolName: "edit" }))).toBe(false);
	});

	it("write → false（不走完全豁免，走策略选择）", () => {
		expect(isAgingExempt(ctx({ toolName: "write" }))).toBe(false);
	});

	it("read 但 path 缺失 → false", () => {
		expect(isAgingExempt(ctx({ toolName: "read", filePath: undefined }))).toBe(
			false,
		);
	});

	it("bash → false", () => {
		expect(isAgingExempt(ctx({ toolName: "bash" }))).toBe(false);
	});
});
