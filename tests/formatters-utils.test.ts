/**
 * formatters-utils.ts 单元测试
 *
 * 纯函数测试：extractJsonPrefix, truncateAtParagraph, unwrapDoubleEncodedJson
 */
import { describe, expect, it } from "vitest";
import {
	extractJsonPrefix,
	truncateAtParagraph,
	unwrapDoubleEncodedJson,
} from "../formatters-utils.js";

// ═══════════════════════════════════════════════════════════════
// extractJsonPrefix
// ═══════════════════════════════════════════════════════════════

describe("extractJsonPrefix", () => {
	it("提取前导数组 JSON", () => {
		const text = '[{"id":1},{"id":2}]\n\nNext: ...';
		expect(extractJsonPrefix(text)).toBe('[{"id":1},{"id":2}]');
	});

	it("提取前导对象 JSON", () => {
		const text = '{"status":"ok","data":{}}\n\n更多信息...';
		expect(extractJsonPrefix(text)).toBe('{"status":"ok","data":{}}');
	});

	it("处理嵌套 JSON 对象", () => {
		const text = '{"a":{"b":{"c":1}}}\n  tail';
		expect(extractJsonPrefix(text)).toBe('{"a":{"b":{"c":1}}}');
	});

	it("处理嵌套 JSON 数组", () => {
		const text = '[[1,2],[3,4]]\n\nnext';
		expect(extractJsonPrefix(text)).toBe("[[1,2],[3,4]]");
	});

	it("处理字符串中的转义引号", () => {
		const text = '{"msg":"他说:\\"你好\\""}\n  tail';
		expect(extractJsonPrefix(text)).toBe('{"msg":"他说:\\"你好\\""}');
	});

	it("不以 [ 或 { 开头 → 返回原文", () => {
		const text = "hello world\nline 2";
		expect(extractJsonPrefix(text)).toBe(text);
	});

	it("未闭合的括号 → 返回原文", () => {
		const text = '{"a":1,"b":2';
		expect(extractJsonPrefix(text)).toBe(text);
	});

	it("空字符串 → 返回空", () => {
		expect(extractJsonPrefix("")).toBe("");
	});

	it("前导空格后接 JSON", () => {
		const text = '  {"key":"value"}\n\n更多';
		expect(extractJsonPrefix(text)).toBe('{"key":"value"}');
	});

	it("纯 JSON 数组完整提取", () => {
		const text = "[1,2,3]";
		expect(extractJsonPrefix(text)).toBe("[1,2,3]");
	});

	it("纯 JSON 对象完整提取", () => {
		const text = '{"x":1}';
		expect(extractJsonPrefix(text)).toBe('{"x":1}');
	});
});

// ═══════════════════════════════════════════════════════════════
// truncateAtParagraph
// ═══════════════════════════════════════════════════════════════

describe("truncateAtParagraph", () => {
	it("文本 ≤ maxChars → 不截断", () => {
		const text = "短文本";
		expect(truncateAtParagraph(text, 100)).toBe(text);
	});

	it("文本长度等于 maxChars → 不截断", () => {
		const text = "a".repeat(50);
		expect(truncateAtParagraph(text, 50)).toBe(text);
	});

	it("找到段落边界且在边界处截断", () => {
		const text = "第一段内容\n\n第二段内容\n\n第三段内容";
		// maxChars = 10，在第一个 \n\n 处截断
		const result = truncateAtParagraph(text, 10);
		expect(result).toBe("第一段内容\n\n...(内容已截断，共 19 字符)");
	});

	it("段落边界后剩余内容很短 → 返回全文", () => {
		// 剩余内容 ≤ maxChars/10 = 5
		const text = "很长很长很长很长很长的一段内容\n\n短尾";
		const result = truncateAtParagraph(text, 20);
		// "短尾" 只有 2 字，≤ 2，所以返回全文
		expect(result).toBe(text);
	});

	it("无段落边界 → 硬截断", () => {
		const text = "这是一个没有段落边界的极长文本，硬截断测试" + "x".repeat(50);
		const result = truncateAtParagraph(text, 20);
		expect(result).toMatch(/^.{20}\n\n\.\.\.\(内容已截断，共 \d+ 字符\)/);
	});

	it("空字符串 → 返回空", () => {
		expect(truncateAtParagraph("", 100)).toBe("");
	});

	it("边界恰好位于 maxChars 位置", () => {
		// "AA\n\nB" → maxChars=2，searchRange="AA"，没有段落边界 → 硬截断
		const text = "AA\n\nB";
		// searchRange = "AA" (slice 0, 2)，没有 \n\n，硬截断
		const result = truncateAtParagraph(text, 2);
		expect(result).toBe("AA\n\n...(内容已截断，共 5 字符)");
	});

	it("边界后剩余内容恰好等于 maxChars/10", () => {
		// 剩余内容 = maxChars/10，不返回全文
		const maxChars = 20;
		const paragraphPart = "xxxxxxxxxxxxxxxxxxx";  // 19 chars
		const afterBoundary = "ab";  // 2 chars — > maxChars/10 (= 2)? No, maxChars/10 = 2, so afterBoundary.length must be > 2 for truncation
		// Let's try: afterBoundary.length = 3 > 2 → truncation
		const text = paragraphPart + "\n\n" + "abc";
		const result = truncateAtParagraph(text, maxChars);
		expect(result).toContain("内容已截断");
	});
});

// ═══════════════════════════════════════════════════════════════
// unwrapDoubleEncodedJson
// ═══════════════════════════════════════════════════════════════

describe("unwrapDoubleEncodedJson", () => {
	it("双重编码 JSON 字符串 → 解包", () => {
		const raw = '"{\\"title\\":\\"test\\",\\"value\\":123}"';
		const result = unwrapDoubleEncodedJson(raw);
		expect(result).toBe('{"title":"test","value":123}');
	});

	it("不以双引号开头 → 返回原文", () => {
		const text = '{"normal":"json"}';
		expect(unwrapDoubleEncodedJson(text)).toBe(text);
	});

	it("JSON 解析失败 → 返回原文", () => {
		const text = '"不是一个有效的编码"';  // 没有转义，外部是 "，内部是中文
		const result = unwrapDoubleEncodedJson('"\\u4e0d\\u662f\\u6709\\u6548\\u7f16\\u7801"');
		expect(result).toBe('不是有效编码');
	});

	it("JSON.parse 返回非字符串 → 返回原文", () => {
		const raw = '"42"';  // JSON.parse('"42"') → "42" (string), not number
		const result = unwrapDoubleEncodedJson(raw);
		expect(result).toBe("42");
	});

	it("普通字符串不以引号开头 → 返回原文", () => {
		expect(unwrapDoubleEncodedJson("hello")).toBe("hello");
	});

	it("空字符串 → 返回原文", () => {
		expect(unwrapDoubleEncodedJson("")).toBe("");
	});

	it("JSON 对象不处理（不以双引号开头）", () => {
		const json = '{"a":1}';
		expect(unwrapDoubleEncodedJson(json)).toBe(json);
	});
});
