import { describe, expect, it } from "vitest";
import {
	buildPiToolCallIndex,
	buildProviderToolCallIndex,
	classifyStatus,
	estTokens,
	fmtSize,
	fmtTok,
	getText,
} from "../../payload/core.js";

describe("estTokens", () => {
	it("空字符串返回 1（下限）", () => expect(estTokens("")).toBe(1));
	it("4 字符 = 1 token", () => expect(estTokens("abcd")).toBe(1));
	it("5 字符 = 2 tokens（向上取整）", () => expect(estTokens("abcde")).toBe(2));
	it("长文本按长度/4 估算", () => expect(estTokens("a".repeat(100))).toBe(25));
});

describe("fmtTok", () => {
	it("< 1000 直接显示数字", () => expect(fmtTok(999)).toBe("999"));
	it(">= 1000 显示为 k", () => expect(fmtTok(1500)).toBe("1.5k"));
	it("1000 显示为 1.0k", () => expect(fmtTok(1000)).toBe("1.0k"));
});

describe("fmtSize", () => {
	it("字节", () => expect(fmtSize(500)).toBe("500B"));
	it("KB", () => expect(fmtSize(2048)).toBe("2.0KB"));
	it("MB", () => expect(fmtSize(1024 * 1024 * 1.5)).toBe("1.5MB"));
});

describe("getText", () => {
	it("null 返回空串", () => expect(getText(null)).toBe(""));
	it("string 直接返回", () => expect(getText("hello")).toBe("hello"));
	it("数组提取 text 类型块", () => {
		const content = [
			{ type: "text", text: "hello" },
			{ type: "image", url: "http://..." },
			{ type: "text", text: "world" },
		];
		expect(getText(content)).toBe("hello\nworld");
	});
	it("其他类型 toString", () => expect(getText(42)).toBe("42"));
});

describe("buildProviderToolCallIndex", () => {
	it("从 provider 格式构建 tool_call 索引", () => {
		const msgs = [
			{
				role: "assistant",
				tool_calls: [
					{
						id: "tc1",
						function: { name: "read", arguments: '{"path":"a.ts"}' },
					},
					{ id: "tc2", function: { name: "bash", arguments: '{"cmd":"ls"}' } },
				],
			},
		];
		const idx = buildProviderToolCallIndex(msgs);
		expect(idx.size).toBe(2);
		expect(idx.get("tc1")).toEqual({
			name: "read",
			argsStr: '{"path":"a.ts"}',
		});
		expect(idx.get("tc2")).toEqual({ name: "bash", argsStr: '{"cmd":"ls"}' });
	});
	it("无 tool_calls 返回空 map", () => {
		expect(
			buildProviderToolCallIndex([{ role: "user", content: "hi" }]).size,
		).toBe(0);
	});
});

describe("buildPiToolCallIndex", () => {
	it("从 pi 内部格式构建索引", () => {
		const msgs = [
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "tc1",
						name: "read",
						arguments: { path: "a.ts" },
					},
				],
			},
		];
		const idx = buildPiToolCallIndex(msgs);
		expect(idx.size).toBe(1);
		expect(idx.get("tc1")!.name).toBe("read");
	});
	it("arguments 字符串直接使用", () => {
		const msgs = [
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "tc1",
						name: "bash",
						arguments: '{"cmd":"ls"}',
					},
				],
			},
		];
		expect(buildPiToolCallIndex(msgs).get("tc1")!.argsStr).toBe('{"cmd":"ls"}');
	});
});

describe("classifyStatus", () => {
	it("包含 [processed] 返回 TRUNCATED", () => {
		expect(classifyStatus("some [processed] text")).toBe("TRUNCATED");
	});
	it(">= threshold tokens 返回 FULL_KEPT", () => {
		expect(classifyStatus("a".repeat(2000))).toBe("FULL_KEPT");
	});
	it("< threshold 返回 SMALL", () => {
		expect(classifyStatus("short")).toBe("SMALL");
	});
});
