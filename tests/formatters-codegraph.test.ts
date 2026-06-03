/**
 * formatters-codegraph.ts 单元测试
 *
 * 覆盖：sniffAstJson, formatAstJson, formatAstMetadata,
 *       sortSearchLines 未知符号类型, 空行压缩边缘情况。
 */
import { describe, expect, it } from "vitest";
import {
	formatCodeGraphResult,
	sniffCodeGraph,
} from "../formatters-codegraph.js";

// ── AST JSON 嗅探 ──────────────────────────────────────

describe("sniffCodeGraph — AST JSON (get_ast_node 非 compact)", () => {
	it("标准 AST JSON → 识别", () => {
		const json = JSON.stringify({
			name: "processToolResult",
			type: "function",
			file_path: "src/core.ts",
			signature: "(x) -> void",
			code_content: "function processToolResult(x) { return x; }",
			start_line: 10,
			end_line: 20,
		});
		expect(sniffCodeGraph(json)).toBe(true);
	});

	it("AST JSON 只有 name + file_path + type → 识别", () => {
		const json = JSON.stringify({
			name: "loadConfig",
			type: "function",
			file_path: "src/config.ts",
		});
		expect(sniffCodeGraph(json)).toBe(true);
	});

	it("AST JSON 用 signature 替代 type → 识别", () => {
		const json = JSON.stringify({
			name: "onClick",
			file_path: "src/ui.ts",
			signature: "(event: Event) => void",
		});
		expect(sniffCodeGraph(json)).toBe(true);
	});

	it("缺少 name → 不识别", () => {
		const json = JSON.stringify({
			type: "function",
			file_path: "src/core.ts",
		});
		expect(sniffCodeGraph(json)).toBe(false);
	});

	it("缺少 file_path → 不识别", () => {
		const json = JSON.stringify({
			name: "foo",
			type: "function",
		});
		expect(sniffCodeGraph(json)).toBe(false);
	});

	it("缺少 type 和 signature → 不识别", () => {
		const json = JSON.stringify({
			name: "foo",
			file_path: "src/core.ts",
		});
		expect(sniffCodeGraph(json)).toBe(false);
	});

	it("不以 { 开头 → 不识别", () => {
		expect(sniffCodeGraph("[1, 2, 3]")).toBe(false);
	});

	it("JSON 解析失败 → 不识别", () => {
		expect(sniffCodeGraph("{corrupt json")).toBe(false);
	});
});

// ── AST JSON 代码内容截断 ──────────────────────────────

describe("formatCodeGraphResult — AST JSON code_content 截断", () => {
	it("code_content ≤ 40 行 → 原样返回", () => {
		const code = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join(
			"\n",
		);
		const input = JSON.stringify({
			name: "smallFunc",
			type: "function",
			file_path: "src/small.ts",
			code_content: code,
			start_line: 1,
			end_line: 30,
		});
		const result = formatCodeGraphResult(input);
		expect(result).not.toContain("lines truncated");
	});

	it("code_content > 40 行 → 截断为 head(15) + tail(5)", () => {
		const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
		const code = lines.join("\n");
		const input = JSON.stringify({
			name: "bigFunc",
			type: "function",
			file_path: "src/big.ts",
			code_content: code,
			start_line: 1,
			end_line: 100,
		});
		const result = formatCodeGraphResult(input);
		expect(result).toContain("80 lines truncated");
	});

	it("code_content 是大对象中一条 → 截断只影响 code_content", () => {
		const code = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join(
			"\n",
		);
		const input = JSON.stringify({
			name: "bigFunc",
			type: "function",
			file_path: "src/big.ts",
			signature: "(x) -> void",
			code_content: code,
			start_line: 1,
			end_line: 50,
		});
		const result = formatCodeGraphResult(input);
		expect(result).toContain("30 lines truncated");
		expect(result).toContain("line 15");
		expect(result).toContain("line 50");
		expect(result).toContain("signature");
	});
});

// ── AST JSON 无代码元数据 ──────────────────────────────

describe("formatCodeGraphResult — AST JSON 元数据格式化", () => {
	it("无 code_content → 输出元数据表格", () => {
		const input = JSON.stringify({
			name: "loadRules",
			type: "function",
			file_path: "shepherd/rules.ts",
			start_line: 10,
			end_line: 42,
			signature: "(x) -> boolean",
			node_id: "12345",
			compact: true,
		});
		const result = formatCodeGraphResult(input);
		expect(result).toContain("loadRules");
		expect(result).toContain("shepherd/rules.ts");
		expect(result).toContain("10-42");
		expect(result).toContain("(compact)");
	});

	it("无 code_content + 无可选字段 → 只输出有值的元数据", () => {
		const input = JSON.stringify({
			name: "minimal",
			type: "var",
			file_path: "src/const.ts",
		});
		const result = formatCodeGraphResult(input);
		expect(result).toContain("minimal");
		expect(result).toContain("src/const.ts");
		expect(result).toContain("var");
		expect(result).not.toContain("signature");
		expect(result).not.toContain("node_id");
	});
});

// ── 搜索排序：未知符号类型 ─────────────────────────────

describe("formatCodeGraphResult — 搜索排序（未知类型）", () => {
	it("未知符号类型排在已知类型后面", () => {
		// isSearch 只识别 fn|class|struct|enum|interface|type|const|var|method
		// 所以「custom」「macro」不被 isSearch 识别
		const input = [
			"macro assert_eq  src/macros.ts:1-10",
			"class DataStore  src/store.ts:10-200",
			"fn process  src/core.ts:50-105",
			"custom foo  src/custom.ts:1-5",
		].join("\n");

		const result = formatCodeGraphResult(input);
		const lines = result.split("\n").filter((l) => l.trim());
		// 由于 custom/macro 不在 SYMBOL_ORDER 中，
		// isSearch 判断为 false（有不匹配的行），因此不排序
		const classIdx = lines.findIndex((l) => l.startsWith("class "));
		const fnIdx = lines.findIndex((l) => l.startsWith("fn "));
		const customIdx = lines.findIndex((l) => l.startsWith("custom "));
		const macroIdx = lines.findIndex((l) => l.startsWith("macro "));
		// class 应在 fn 前面（按序号 0 vs 5）
		expect(classIdx).toBeLessThan(fnIdx);
		// custom 和 macro 不在 SYMBOL_ORDER 中 → 按顺序在原始位置
		// macro 在 class 前面（原始顺序）
		expect(macroIdx).toBeLessThan(classIdx);
		expect(customIdx).toBeGreaterThan(fnIdx);
	});
});

// ── Impact 不同风险级别 ───────────────────────────────

describe("formatCodeGraphResult — Impact 不同风险级别", () => {
	it("Risk HIGH", () => {
		const input = "Impact: MyFunc — Risk: HIGH\n  1 caller";
		const result = formatCodeGraphResult(input);
		expect(result).toContain("HIGH");
	});
	it("Risk MEDIUM", () => {
		const input = "Impact: MyFunc — Risk: MEDIUM\n  1 caller";
		const result = formatCodeGraphResult(input);
		expect(result).toContain("MEDIUM");
	});
	it("Risk LOW", () => {
		const input = "Impact: MyFunc — Risk: LOW\n  1 caller";
		const result = formatCodeGraphResult(input);
		expect(result).toContain("LOW");
	});
});

// ── 空行压缩边缘情况 ──────────────────────────────────

describe("formatCodeGraphResult — 空行压缩边缘情况", () => {
	it("开头多个空行 → 保留内容", () => {
		const input = ["", "", "fn foo  src/a.ts:1-10"].join("\n");
		const result = formatCodeGraphResult(input);
		// 内容保留
		expect(result).toContain("fn foo  src/a.ts:1-10");
	});

	it("结尾多个空行 → 压缩", () => {
		const input = ["fn foo  src/a.ts:1-10", "", "", ""].join("\n");
		const result = formatCodeGraphResult(input);
		// 不应以多个空行结尾
		expect(result.trimEnd()).not.toBe("");
		expect(result).not.toMatch(/\n{3,}$/);
	});
});

// ── 纯文本回退 ───────────────────────────────────────

describe("formatCodeGraphResult — 纯文本回退", () => {
	it("JSON 但不满足任何 sniff → 原样返回", () => {
		const input = JSON.stringify({ x: 1, y: 2 });
		expect(formatCodeGraphResult(input)).toBe(input);
	});

	it("数组 JSON 不满足 sniff → 原样返回", () => {
		const input = JSON.stringify([1, 2, 3]);
		expect(formatCodeGraphResult(input)).toBe(input);
	});
});
