/**
 * formatters-gh.ts 单元测试
 *
 * 纯函数测试：formatGhResult
 * 覆盖三种结构：gh_search_doc, gh_read_file, gh_repo_structure
 */
import { describe, expect, it } from "vitest";
import { formatGhResult } from "../formatters-gh.js";

// ═══════════════════════════════════════════════════════════════
// gh_search_doc
// ═══════════════════════════════════════════════════════════════

describe("formatGhResult — gh_search_doc", () => {
	it("results 数组 → 编号列表", () => {
		const input = JSON.stringify({
			results: [
				{ title: "API 文档", url: "https://example.com/api", summary: "RESTful API" },
				{ title: "CLI 指南", url: "https://example.com/cli" },
			],
		});
		const result = formatGhResult(input);
		expect(result).toContain("[1]");
		expect(result).toContain("API 文档");
		expect(result).toContain("https://example.com/api");
		expect(result).toContain("RESTful API");
		expect(result).toContain("[2]");
		expect(result).toContain("CLI 指南");
		expect(result).toContain("https://example.com/cli");
	});

	it("空 results 数组 → 返回 (共 0 条)", () => {
		const input = JSON.stringify({ results: [] });
		expect(formatGhResult(input)).toBe("（共 0 条）");
	});

	it("results 项缺少可选字段不崩溃", () => {
		const input = JSON.stringify({
			results: [
				{ title: "Minimal" },
				{},
				{ url: "https://example.com" },
			],
		});
		const result = formatGhResult(input);
		expect(result).toContain("[1]");
		expect(result).toContain("Minimal");
		expect(result).toContain("[3]");
		expect(result).toContain("https://example.com");
	});
});

// ═══════════════════════════════════════════════════════════════
// gh_read_file
// ═══════════════════════════════════════════════════════════════

describe("formatGhResult — gh_read_file", () => {
	it("content + path → 文件路径 + 内容", () => {
		const input = JSON.stringify({
			path: "src/main.ts",
			content: "const x = 1;",
		});
		expect(formatGhResult(input)).toBe("文件: src/main.ts\n\nconst x = 1;");
	});

	it("只有 path，无 content → 只显示路径", () => {
		const input = JSON.stringify({ path: "README.md" });
		expect(formatGhResult(input)).toBe("文件: README.md\n\n");
	});

	it("只有 content，无 path → 因为没有 path 特征字段，fallback 到原文", () => {
		// gh_read_file 分支需要 path in obj 才触发
		const input = JSON.stringify({ content: "hello world" });
		expect(formatGhResult(input)).toBe(input);
	});

	it("path + null content → 只显示路径", () => {
		const input = JSON.stringify({ path: "file.txt", content: null });
		expect(formatGhResult(input)).toBe("文件: file.txt\n\n");
	});

	it("null path + null content → fallback 到原文", () => {
		const input = JSON.stringify({ path: null, content: null });
		expect(formatGhResult(input)).toBe(input);
	});
});

// ═══════════════════════════════════════════════════════════════
// gh_repo_structure
// ═══════════════════════════════════════════════════════════════

describe("formatGhResult — gh_repo_structure", () => {
	it("tree → 缩进树形结构", () => {
		const input = JSON.stringify({
			tree: [
				{ name: "src", type: "directory", children: [
					{ name: "index.ts", type: "file" },
					{ name: "utils", type: "directory", children: [
						{ name: "helpers.ts", type: "file" },
					]},
				]},
				{ name: "README.md", type: "file" },
			],
		});
		const result = formatGhResult(input);
		expect(result).toContain("src/");
		expect(result).toContain("  index.ts");
		expect(result).toContain("  utils/");
		expect(result).toContain("    helpers.ts");
		expect(result).toContain("README.md");
	});

	it("空 tree → fallback 到原文", () => {
		const input = JSON.stringify({ tree: [] });
		expect(formatGhResult(input)).toBe(input);
	});

	it("非数组 tree → fallback 到原文", () => {
		const input = JSON.stringify({ tree: "not-an-array" });
		expect(formatGhResult(input)).toBe(input);
	});
});

// ═══════════════════════════════════════════════════════════════
// 回退场景
// ═══════════════════════════════════════════════════════════════

describe("formatGhResult — 语义验证：防止非 gh 工具的 results 被误匹配", () => {
	it("code-graph ast_search 的 {count, results} 不应被误匹配为 gh_search_doc", () => {
		const input = JSON.stringify({
			count: 5,
			results: [
				{ name: "compileRules", type: "function", file_path: "pi-shepherd/shepherd/rules.ts", start_line: 138, end_line: 157 },
				{ name: "ruleMatches", type: "function", file_path: "pi-shepherd/shepherd/rules.ts", start_line: 261, end_line: 279 },
			],
		});
		// 不应被 gh formatter 改变，应 fallback 返回原文
		expect(formatGhResult(input)).toBe(input);
	});

	it("results 只有 name 字段（无 title/url/summary）→ fallback 到原文", () => {
		const input = JSON.stringify({
			results: [{ name: "foo" }, { name: "bar" }],
		});
		expect(formatGhResult(input)).toBe(input);
	});

	it("results 混合 gh 和非 gh 字段，但至少有一个 title → 匹配成功", () => {
		const input = JSON.stringify({
			results: [
				{ title: "API 文档", url: "https://example.com" },
				{ name: "foo" },
			],
		});
		const result = formatGhResult(input);
		expect(result).toContain("[1]");
		expect(result).toContain("API 文档");
	});
});

describe("formatGhResult — 回退", () => {
	it("非 JSON 文本 → 返回原文", () => {
		const text = "This is not JSON at all";
		expect(formatGhResult(text)).toBe(text);
	});

	it("JSON.parse 返回原始类型（字符串）→ 返回原文", () => {
		const input = '"我只是一个字符串"';
		expect(formatGhResult(input)).toBe(input);
	});

	it("JSON.parse 返回原始类型（数字）→ 返回原文", () => {
		const input = "42";
		expect(formatGhResult(input)).toBe(input);
	});

	it("JSON.parse 返回 null → 返回原文", () => {
		const input = "null";
		expect(formatGhResult(input)).toBe(input);
	});

	it("未知结构 → 返回原文", () => {
		const input = JSON.stringify({ unknown: "structure", data: 123 });
		expect(formatGhResult(input)).toBe(input);
	});

	it("空字符串 → 返回空", () => {
		expect(formatGhResult("")).toBe("");
	});
});
