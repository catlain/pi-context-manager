/**
 * formatters.ts 单元测试
 *
 * 覆盖：formatBashResult（透传函数）、re-export 可访问性检查
 */
import { describe, expect, it } from "vitest";

import {
	formatBashResult,
	formatGhResult,
	formatWebReadResult,
	formatWebSearchResult,
	truncateAtParagraph,
	unwrapDoubleEncodedJson,
} from "../formatters.js";

describe("formatBashResult", () => {
	it("透传返回原文本", () => {
		const text = "hello world\nline 2";
		expect(formatBashResult(text)).toBe(text);
	});

	it("空字符串透传", () => {
		expect(formatBashResult("")).toBe("");
	});

	it("特殊字符透传", () => {
		const text = "a\nb\tc\nd\n";
		expect(formatBashResult(text)).toBe(text);
	});
});

describe("re-exports 可访问性", () => {
	it("formatGhResult 是函数", () => {
		expect(typeof formatGhResult).toBe("function");
	});

	it("formatWebReadResult 是函数", () => {
		expect(typeof formatWebReadResult).toBe("function");
	});

	it("formatWebSearchResult 是函数", () => {
		expect(typeof formatWebSearchResult).toBe("function");
	});

	it("truncateAtParagraph 是函数", () => {
		expect(typeof truncateAtParagraph).toBe("function");
	});

	it("unwrapDoubleEncodedJson 是函数", () => {
		expect(typeof unwrapDoubleEncodedJson).toBe("function");
	});
});
