/**
 * messages.ts 测试（基础）— 文件无效、msgIndex、msgRange、无参数模式
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock core.js ──
const mockReadJsonFile = vi.fn(() => null);
vi.mock("../../payload/core.js", () => ({
	estTokens: (s: string) => Math.ceil(s.length / 4),
	fmtTok: (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)),
	getText: (c: any) => (typeof c === "string" ? c : Array.isArray(c)
		? c.filter((p: any) => p.type === "text").map((p: any) => p.text ?? "").join("\n")
		: c == null ? "" : String(c)),
	buildProviderToolCallIndex: (msgs: any[]) => {
		const m = new Map();
		for (const msg of msgs) {
			if (msg.tool_calls) {
				for (const tc of msg.tool_calls) {
					m.set(tc.id, { name: tc.function.name, argsStr: tc.function.arguments });
				}
			}
		}
		return m;
	},
	readJsonFile: (...args: any[]) => mockReadJsonFile(...args),
	RECORDINGS_DIR: "/tmp/test-recordings",
	DISTILL_DIR: "/tmp/pi-distill",
}));

import { doMessages } from "../../payload/messages.js";

// ── Helpers ──

/** 匹配索引标记 [N]（允许空格填充） */
function hasIdx(result: string, n: number) {
	return expect(result).toMatch(new RegExp(`\\[\\s*${n}\\s*\\]`));
}
function noIdx(result: string, n: number) {
	return expect(result).not.toMatch(new RegExp(`\\[\\s*${n}\\s*\\]`));
}

function makePayload(msgs: any[]) { return { messages: msgs, model: "test-model" }; }
function msg(role: string, content: string, extra: Record<string, any> = {}) {
	return { role, content, ...extra };
}
function assistantWithToolCall(id: string, toolName: string, args: string) {
	return { role: "assistant", tool_calls: [{ id, function: { name: toolName, arguments: args } }], content: null };
}
function toolResult(id: string, content: string) {
	return { role: "tool", tool_call_id: id, content };
}

// ════════════════════════════════════════════════════════════
// 文件不存在 / 空 payload
// ════════════════════════════════════════════════════════════

describe("doMessages — 文件不存在或无效", () => {
	beforeEach(() => mockReadJsonFile.mockReset());

	it("payloadPath 不存在时返回错误提示", () => {
		mockReadJsonFile.mockReturnValue(null);
		const result = doMessages({ payloadPath: "/no/such/file.json" });
		expect(result).toContain("文件不存在");
		expect(result).toContain("/no/such/file.json");
	});

	it("messages 为空数组时返回提示", () => {
		mockReadJsonFile.mockReturnValue(makePayload([]));
		const result = doMessages({ payloadPath: "/tmp/test.json" });
		expect(result).toContain("没有消息");
	});

	it("payload 没有 messages 字段时返回提示", () => {
		mockReadJsonFile.mockReturnValue({ model: "test" });
		const result = doMessages({ payloadPath: "/tmp/test.json" });
		expect(result).toContain("没有消息");
	});
});

// ════════════════════════════════════════════════════════════
// msgIndex
// ════════════════════════════════════════════════════════════

describe("doMessages — msgIndex 查看第 N 条消息", () => {
	const payload = makePayload([
		msg("system", "You are a helpful assistant."),
		msg("user", "Hello, how are you?"),
		assistantWithToolCall("tc1", "read", '{"path":"a.ts"}'),
		toolResult("tc1", "export const foo = 1;"),
		msg("assistant", "The value is 1."),
		msg("user", "What about bar?"),
		assistantWithToolCall("tc2", "bash", '{"command":"ls -la"}'),
		toolResult("tc2", "total 32\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 ."),
		msg("assistant", "Here is the listing."),
	]);

	beforeEach(() => mockReadJsonFile.mockReturnValue(payload));

	it("显示指定消息的完整详情", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgIndex: 1 });
		hasIdx(result, 1);
		expect(result).toContain("user");
		expect(result).toContain("Hello, how are you?");
	});

	it("显示 tool result 消息的工具名", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgIndex: 3 });
		hasIdx(result, 3);
		expect(result).toContain("tool");
		expect(result).toContain("read");
		expect(result).toContain("export const foo = 1;");
	});

	it("msgIndex 超出范围时返回错误", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgIndex: 100 });
		expect(result).toContain("越界");
	});

	it("负数 msgIndex 时返回错误", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgIndex: -1 });
		expect(result).toContain("越界");
	});

	it("context=2 时显示前后各 2 条消息的摘要", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgIndex: 4, context: 2 });
		hasIdx(result, 2);
		hasIdx(result, 4);
		hasIdx(result, 6);
		expect(result).toContain("The value is 1.");
	});

	it("context=0 时只显示目标消息", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgIndex: 0, context: 0 });
		hasIdx(result, 0);
		expect(result).toContain("system");
		noIdx(result, 1);
	});

	it("context 靠近消息数组头部时不越界", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgIndex: 0, context: 3 });
		hasIdx(result, 0);
		hasIdx(result, 3);
	});

	it("context 靠近消息数组尾部时不越界", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgIndex: 8, context: 3 });
		hasIdx(result, 6);
		hasIdx(result, 8);
		noIdx(result, 9);
	});

	it("msgIndex = 0 时正常显示 system 消息", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgIndex: 0 });
		hasIdx(result, 0);
		expect(result).toContain("system");
		expect(result).toContain("You are a helpful assistant.");
	});

	it("msgIndex = 最后一条时正常显示", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgIndex: 8 });
		hasIdx(result, 8);
		expect(result).toContain("Here is the listing.");
	});

	it("非常大的 content 在 msgIndex 时截断显示", () => {
		const big = makePayload([msg("tool", "x".repeat(50000))]);
		mockReadJsonFile.mockReturnValue(big);
		const result = doMessages({ payloadPath: "/tmp/test.json", msgIndex: 0 });
		hasIdx(result, 0);
		expect(result.length).toBeLessThan(10000);
	});
});

// ════════════════════════════════════════════════════════════
// msgRange
// ════════════════════════════════════════════════════════════

describe("doMessages — msgRange 查看消息范围", () => {
	const payload = makePayload(
		Array.from({ length: 20 }, (_, i) => msg(i % 2 === 0 ? "user" : "assistant", `Message ${i}`))
	);

	beforeEach(() => mockReadJsonFile.mockReturnValue(payload));

	it('"5-10" 显示第 5 到第 10 条消息', () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgRange: "5-10" });
		hasIdx(result, 5);
		hasIdx(result, 10);
		noIdx(result, 4);
		noIdx(result, 11);
	});

	it('"last:5" 显示最后 5 条消息', () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgRange: "last:5" });
		hasIdx(result, 15);
		hasIdx(result, 19);
		noIdx(result, 14);
	});

	it('"last:3" 显示最后 3 条', () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgRange: "last:3" });
		hasIdx(result, 17);
		hasIdx(result, 19);
		noIdx(result, 16);
	});

	it("last:N 超出消息总数时显示全部", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgRange: "last:100" });
		hasIdx(result, 0);
		hasIdx(result, 19);
	});

	it("范围越界时自动裁剪到有效范围", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgRange: "18-30" });
		hasIdx(result, 18);
		hasIdx(result, 19);
		noIdx(result, 20);
	});

	it("起始 > 结束时返回错误", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgRange: "10-5" });
		expect(result).toContain("无效");
	});

	it("格式错误的 msgRange 返回错误", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgRange: "abc" });
		expect(result).toContain("无效");
	});

	it('"0-0" 只显示第 0 条', () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgRange: "0-0" });
		hasIdx(result, 0);
		noIdx(result, 1);
	});

	it("每条消息显示索引/role/token/预览", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", msgRange: "5-7" });
		expect(result).toMatch(/\[.*5.*\]/);
		expect(result).toMatch(/assistant|user/);
		expect(result).toMatch(/Message 5/);
	});
});

// ════════════════════════════════════════════════════════════
// 无参数：全部摘要
// ════════════════════════════════════════════════════════════

describe("doMessages — 无过滤参数显示全部摘要", () => {
	beforeEach(() => mockReadJsonFile.mockReset());

	it("显示所有消息的索引/role/token/预览", () => {
		mockReadJsonFile.mockReturnValue(makePayload([
			msg("system", "System prompt here."),
			msg("user", "Do something."),
			msg("assistant", "OK, done."),
		]));
		const result = doMessages({ payloadPath: "/tmp/test.json" });
		hasIdx(result, 0);
		hasIdx(result, 1);
		hasIdx(result, 2);
		expect(result).toContain("system");
	});

	it("消息总数很多时默认截断", () => {
		mockReadJsonFile.mockReturnValue(makePayload(
			Array.from({ length: 200 }, (_, i) => msg("user", `Long message ${i} with some content`))
		));
		const result = doMessages({ payloadPath: "/tmp/test.json" });
		expect(result).toContain("200");
		expect(result.split("\n").length).toBeLessThan(60);
	});
});
