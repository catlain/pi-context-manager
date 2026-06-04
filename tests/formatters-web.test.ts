import { describe, expect, it } from "vitest";
import {
	formatWebReadResult,
	formatWebSearchResult,
} from "../formatters-web.js";

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

	it("只有 title 无 link 的数组不应被格式化", () => {
		const input = JSON.stringify([{ title: "测试标题", content: "摘要" }]);
		const result = formatWebSearchResult(input);
		expect(result).toBe(input);
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

	// ── 误判防护测试（E14 修复） ──

	it("JSON Schema 文件不应被误判为 web_read 结果", () => {
		// 真实 case：common.schema.json 有 title 字段被误判
		const input = JSON.stringify({
			"$schema": "https://json-schema.org/draft/2020-12/schema",
			"title": "Structured Agent Artifact Envelope",
			"type": "object",
			"properties": {
				"version": { "type": "string" },
				"artifacts": { "type": "array" }
			}
		});
		expect(formatWebReadResult(input)).toBe(input);
	});

	it("有 title 无 url 的 JSON 不应被误判", () => {
		const input = JSON.stringify({
			title: "某个对象",
			content: "一些内容",
		});
		expect(formatWebReadResult(input)).toBe(input);
	});

	it("url 为空字符串不应被误判", () => {
		const input = JSON.stringify({
			title: "某个对象",
			url: "",
			content: "内容",
		});
		expect(formatWebReadResult(input)).toBe(input);
	});

	it("url 为非 string 类型不应被误判", () => {
		const input = JSON.stringify({
			title: "某个对象",
			url: 123,
			content: "内容",
		});
		expect(formatWebReadResult(input)).toBe(input);
	});

	it("有 url 的 JSON 应正常格式化", () => {
		const input = JSON.stringify({
			title: "测试页面",
			url: "https://example.com/page",
			content: "页面内容",
		});
		const result = formatWebReadResult(input);
		expect(result).toContain("标题: 测试页面");
		expect(result).toContain("URL: https://example.com/page");
	});

	it("有 url 无 content 的 JSON 应正常格式化（只输出 header）", () => {
		const input = JSON.stringify({
			title: "测试页面",
			url: "https://example.com/page",
		});
		const result = formatWebReadResult(input);
		expect(result).toContain("标题: 测试页面");
		expect(result).toContain("URL: https://example.com/page");
		expect(result).not.toContain("\n\n"); // 没有 content 不应有空段落
	});

	it("双重编码的 web_read 结果应正常格式化", () => {
		// GLM web reader 的真实输出是双重编码 JSON
		const inner = JSON.stringify({
			title: "编码页面",
			url: "https://example.com/double",
			content: "双重编码内容",
		});
		const input = JSON.stringify(inner); // 双重编码
		const result = formatWebReadResult(input);
		expect(result).toContain("标题: 编码页面");
		expect(result).toContain("URL: https://example.com/double");
	});
});
