/**
 * 纯函数单元测试：selectAgingThreshold
 *
 * 直接测 distill-helpers.ts 导出的纯函数，不走 handleContextEvent 集成路径。
 */
import { describe, expect, it } from "vitest";
import {
	type AgingContext,
	selectAgingThreshold,
} from "../distill-helpers.js";
import type { ContextConfig } from "../shared.js";

// ── 测试用配置基座（只需 selectAgingThreshold 实际读取的 4 个字段） ──
const cfg = (o: Partial<ContextConfig> = {}): ContextConfig => ({
	distillThreshold: 1000,
	agingThreshold: 10,
	errorAgingThreshold: 3,
	largeResultAging: 2,
	processorThreshold: 500,
	firstSeenCap: 15000,
	...o,
});

const ctx = (o: Partial<AgingContext> = {}): AgingContext => ({
	toolName: "bash",
	isError: false,
	tokens: 100,
	filePath: undefined,
	...o,
});

describe("selectAgingThreshold", () => {
	it("edit 非错误 → Infinity（豁免 A 和 C）", () => {
		expect(
			selectAgingThreshold(ctx({ toolName: "edit", isError: false }), cfg()),
		).toBe(Number.POSITIVE_INFINITY);
	});

	it("write 非错误 → Infinity（豁免 A 和 C）", () => {
		expect(
			selectAgingThreshold(ctx({ toolName: "write", isError: false }), cfg()),
		).toBe(Number.POSITIVE_INFINITY);
	});

	it("edit 错误 → errorAgingThreshold（B 不豁免）", () => {
		expect(
			selectAgingThreshold(ctx({ toolName: "edit", isError: true }), cfg()),
		).toBe(3);
	});

	it("write 错误 → errorAgingThreshold（B 不豁免）", () => {
		expect(
			selectAgingThreshold(ctx({ toolName: "write", isError: true }), cfg()),
		).toBe(3);
	});

	it("bash 错误 → errorAgingThreshold", () => {
		expect(
			selectAgingThreshold(ctx({ toolName: "bash", isError: true }), cfg()),
		).toBe(3);
	});

	it("bash 大文件（tokens >= distillThreshold）→ largeResultAging", () => {
		expect(
			selectAgingThreshold(
				ctx({ toolName: "bash", tokens: 1500 }),
				cfg({ distillThreshold: 1000, largeResultAging: 2 }),
			),
		).toBe(2);
	});

	it("bash 小文件 → agingThreshold", () => {
		expect(
			selectAgingThreshold(
				ctx({ toolName: "bash", tokens: 100 }),
				cfg({ agingThreshold: 10 }),
			),
		).toBe(10);
	});

	it("edit 错误大文件 → largeResultAging（A 优先于 B）", () => {
		// edit 错误 + 大文件：不走 Infinity（因为是 isError），走 A（大文件优先于 B）
		expect(
			selectAgingThreshold(
				ctx({ toolName: "edit", isError: true, tokens: 1500 }),
				cfg({ distillThreshold: 1000, largeResultAging: 2, errorAgingThreshold: 3 }),
			),
		).toBe(2);
	});

	it("errorAgingThreshold=0 时，错误结果不走 B 分支", () => {
		// isError=true 但 errorAging=0 → 跳过 B，走后续（大文件/普通）
		expect(
			selectAgingThreshold(
				ctx({ toolName: "bash", isError: true, tokens: 100 }),
				cfg({ errorAgingThreshold: 0, agingThreshold: 10 }),
			),
		).toBe(10);
	});

	it("errorAgingThreshold=0 时，错误大文件走 A 分支", () => {
		expect(
			selectAgingThreshold(
				ctx({ toolName: "bash", isError: true, tokens: 1500 }),
				cfg({ errorAgingThreshold: 0, largeResultAging: 2 }),
			),
		).toBe(2);
	});

	it("edit 非错误优先级高于大文件（tokens 大但走 Infinity）", () => {
		// edit 非错误，即使 tokens 很大，也是 Infinity，不走 A
		expect(
			selectAgingThreshold(
				ctx({ toolName: "edit", isError: false, tokens: 99999 }),
				cfg({ largeResultAging: 2 }),
			),
		).toBe(Number.POSITIVE_INFINITY);
	});

	it("largeResultAging=0 时，大文件不走 A，走 C", () => {
		expect(
			selectAgingThreshold(
				ctx({ toolName: "bash", tokens: 1500 }),
				cfg({ largeResultAging: 0, agingThreshold: 10 }),
			),
		).toBe(10);
	});
});
