import { describe, it, expect } from "vitest";
import { formatWebSearchResult, formatWebReadResult } from "./formatters-web.js";

describe("formatWebSearchResult", () => {
	it("正常搜索结果应格式化", () => {
		const input = JSON.stringify([
			{ title: "Result 1", link: "https://example.com/1", content: "摘要1" },
			{ title: "Result 2", link: "https://example.com/2", content: "摘要2" },
		]);
		const result = formatWebSearchResult(input);
		expect(result).toContain("搜索结果（共 2 条）");
		expect(result).toContain("Result 1");
		expect(result).toContain("https://example.com/1");
	});

	it("settings.json packages 输出不应被误判为搜索结果", () => {
		const input = JSON.stringify(
			[
				{ source: "git:github.com/catlain/pi-shepherd" },
				{ source: "git:github.com/catlain/pi-context-manager" },
				{ source: "npm:pi-tool-display", extensions: ["+index.ts"] },
				"npm:pi-agent-codebase-workflows",
			],
			null,
			2,
		);
		const result = formatWebSearchResult(input);
		expect(result).toBe(input); // 不应被格式化
	});

	it("纯字符串数组不应被误判", () => {
		const input = JSON.stringify(["foo", "bar", "baz"]);
		const result = formatWebSearchResult(input);
		expect(result).toBe(input);
	});

	it("有 link 字段的数组应被格式化", () => {
		const input = JSON.stringify([
			{ link: "https://example.com", content: "摘要" },
		]);
		const result = formatWebSearchResult(input);
		expect(result).toContain("搜索结果");
		expect(result).toContain("https://example.com");
	});

	it("有 title 字段的数组应被格式化", () => {
		const input = JSON.stringify([
			{ title: "测试标题", content: "摘要" },
		]);
		const result = formatWebSearchResult(input);
		expect(result).toContain("测试标题");
	});

	it("空数组返回 0 条提示", () => {
		const result = formatWebSearchResult("[]");
		expect(result).toBe("搜索结果（共 0 条）");
	});

	it("非 JSON 文本原样返回", () => {
		const text = "这是普通文本，不是 JSON";
		expect(formatWebSearchResult(text)).toBe(text);
	});

	it("JSON 对象（非数组）原样返回", () => {
		const input = JSON.stringify({ link: "https://example.com" });
		expect(formatWebSearchResult(input)).toBe(input);
	});

	it("link 为函数原型方法的对象不应被误判（String.prototype.link）", () => {
		// 这个测试验证关键 bug：JavaScript 的 String.prototype.link 是已废弃的 HTML 方法
		// { source: "git:..." } 对象的 source 字符串有 .link 方法
		// 必须用 typeof === "string" 而非 truthy 检查
		const input = JSON.stringify([
			{ source: "git:github.com/catlain/pi-shepherd" },
			{ source: "git:github.com/catlain/pi-context-manager" },
		]);
		const result = formatWebSearchResult(input);
		expect(result).toBe(input);
	});
});

describe("formatWebReadResult", () => {
	it("正常 web_read 结果应格式化", () => {
		const input = JSON.stringify({
			title: "测试页面",
			url: "https://example.com",
			content: "A".repeat(20000),
		});
		const result = formatWebReadResult(input);
		expect(result).toContain("标题: 测试页面");
		expect(result).toContain("URL: https://example.com");
		expect(result).toContain("内容已截断");
	});

	it("非 JSON 文本原样返回", () => {
		const text = "普通文本";
		expect(formatWebReadResult(text)).toBe(text);
	});
});
