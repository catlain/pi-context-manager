/**
 * 纯函数单元测试：isAgingExempt — 架构宪法文档组（ADR / INVARIANTS / Design Note）
 *
 * 直接测 distill-helpers.ts 导出的纯函数，不走 handleContextEvent 集成路径。
 * 其余豁免组（skill / openspec design.md / edit-write 边界；plans 已不再豁免）见 aging-exempt-unit.test.ts。
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

describe("isAgingExempt — 架构宪法文档", () => {
	// ── 架构宪法文档（ADR / INVARIANTS / Design Note）──

	it("read 编号 ADR → true", () => {
		expect(
			isAgingExempt(
				ctx({
					toolName: "read",
					filePath:
						"docs/agent/adr/0390-ic-single-substrate-dual-view.md",
				}),
			),
		).toBe(true);
	});

	it("read ADR 索引与归档 → true", () => {
		expect(
			isAgingExempt(
				ctx({ toolName: "read", filePath: "docs/agent/adr/INDEX.md" }),
			),
		).toBe(true);
		expect(
			isAgingExempt(
				ctx({
					toolName: "read",
					filePath: "docs/agent/adr-archive/0368-xxx.md",
				}),
			),
		).toBe(true);
	});

	it("read 单文件形态 docs/agent/ADR.md → true", () => {
		expect(
			isAgingExempt(
				ctx({ toolName: "read", filePath: "docs/agent/ADR.md" }),
			),
		).toBe(true);
	});

	it("read INVARIANTS.md → true", () => {
		expect(
			isAgingExempt(
				ctx({
					toolName: "read",
					filePath: "docs/agent/INVARIANTS.md",
				}),
			),
		).toBe(true);
	});

	it("read Design Note（docs/agent/designs/）→ true", () => {
		expect(
			isAgingExempt(
				ctx({
					toolName: "read",
					filePath: "docs/agent/designs/回测引擎.md",
				}),
			),
		).toBe(true);
	});

	it("read docs/agent 前缀外同名文件 → false（误伤防护）", () => {
		expect(
			isAgingExempt(
				ctx({ toolName: "read", filePath: "results/designs/x.md" }),
			),
		).toBe(false);
		expect(
			isAgingExempt(
				ctx({ toolName: "read", filePath: "docs/ADR.md" }),
			),
		).toBe(false);
		expect(
			isAgingExempt(ctx({ toolName: "read", filePath: "ADR.md" })),
		).toBe(false);
	});
});
