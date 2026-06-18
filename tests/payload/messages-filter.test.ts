/**
 * messages.ts 测试（过滤）— grep、toolName、组合参数、边缘情况
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadJsonFile = vi.fn(() => null as unknown as any);
vi.mock("../../payload/core.js", () => ({
	estTokens: (s: string) => Math.ceil(s.length / 4),
	fmtTok: (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)),
	getText: (c: any) =>
		typeof c === "string"
			? c
			: Array.isArray(c)
				? c
						.filter((p: any) => p.type === "text")
						.map((p: any) => p.text ?? "")
						.join("\n")
				: c == null
					? ""
					: String(c),
	buildProviderToolCallIndex: (msgs: any[]) => {
		const m = new Map();
		for (const msg of msgs) {
			if (msg.tool_calls) {
				for (const tc of msg.tool_calls) {
					if (tc.function) {
						m.set(tc.id, {
							name: tc.function.name,
							argsStr: tc.function.arguments,
						});
					}
				}
			}
		}
		return m;
	},
	readJsonFile: (...args: unknown[]) => (mockReadJsonFile as Function).apply(null, args),
	RECORDINGS_DIR: "/tmp/test-recordings",
	DISTILL_DIR: "/tmp/pi-distill",
}));

import { doMessages } from "../../payload/messages.js";

function makePayload(msgs: any[]) {
	return { messages: msgs, model: "test" };
}
function msg(role: string, content: string) {
	return { role, content };
}
function tc(id: string, name: string, args: string) {
	return {
		role: "assistant",
		tool_calls: [{ id, function: { name, arguments: args } }],
		content: null,
	};
}
function tr(id: string, content: string) {
	return { role: "tool", tool_call_id: id, content };
}

function hasIdx(r: string, n: number) {
	expect(r).toMatch(new RegExp(`\\[\\s*${n}\\s*\\]`));
}
function noIdx(r: string, n: number) {
	expect(r).not.toMatch(new RegExp(`\\[\\s*${n}\\s*\\]`));
}

// ════════════════════════════════════════════════════════════
// grep
// ════════════════════════════════════════════════════════════

describe("doMessages — grep 按关键词搜索", () => {
	const payload = makePayload([
		msg("system", "You are a helpful coding assistant."),
		msg("user", "Read the file main.ts"),
		tc("tc1", "read", '{"path":"main.ts"}'),
		tr("tc1", "export function main() { return 42; }"),
		msg("assistant", "The main function returns 42."),
		msg("user", "Now check the test file"),
		tc("tc2", "read", '{"path":"test.ts"}'),
		tr("tc2", "import { main } from './main'; test('main', () => {});"),
		msg("assistant", "Tests look good."),
	]);

	beforeEach(() => mockReadJsonFile.mockReturnValue(payload));

	it("搜索 'main.ts' 命中相关消息", () => {
		const result = doMessages({
			payloadPath: "/tmp/test.json",
			grep: "main.ts",
		});
		expect(result).toContain("main.ts");
		hasIdx(result, 1);
		hasIdx(result, 2);
	});

	it("搜索不存在的关键词返回空结果提示", () => {
		const result = doMessages({
			payloadPath: "/tmp/test.json",
			grep: "zzz_nonexistent",
		});
		expect(result).toContain("没有匹配");
	});

	it("grep 大小写不敏感", () => {
		const result = doMessages({
			payloadPath: "/tmp/test.json",
			grep: "MAIN.TS",
		});
		expect(result).toContain("main.ts");
	});

	it("grep 搜索 tool call 的 arguments", () => {
		const result = doMessages({
			payloadPath: "/tmp/test.json",
			grep: "test.ts",
		});
		hasIdx(result, 6); // assistant tool_call 的 arguments 含 test.ts
		noIdx(result, 7); // tool result content 中不含 test.ts
	});

	it("grep 支持正则表达式", () => {
		const result = doMessages({
			payloadPath: "/tmp/test.json",
			grep: "main\\.ts|test\\.ts",
		});
		expect(result).toContain("main.ts");
		expect(result).toContain("test.ts");
	});
});

// ════════════════════════════════════════════════════════════
// toolName
// ════════════════════════════════════════════════════════════

describe("doMessages — toolName 按工具名过滤", () => {
	const payload = makePayload([
		msg("system", "sys"),
		msg("user", "do stuff"),
		tc("tc1", "read", '{"path":"a.ts"}'),
		tr("tc1", "content of a"),
		tc("tc2", "bash", '{"command":"ls"}'),
		tr("tc2", "file1\nfile2"),
		tc("tc3", "read", '{"path":"b.ts"}'),
		tr("tc3", "content of b"),
		msg("assistant", "done"),
	]);

	beforeEach(() => mockReadJsonFile.mockReturnValue(payload));

	it("只显示 read 工具的 tool result", () => {
		const result = doMessages({
			payloadPath: "/tmp/test.json",
			toolName: "read",
		});
		expect(result).toContain("read");
		expect(result).not.toContain("bash");
		hasIdx(result, 3);
		hasIdx(result, 7);
	});

	it("只显示 bash 工具的 tool result", () => {
		const result = doMessages({
			payloadPath: "/tmp/test.json",
			toolName: "bash",
		});
		expect(result).toContain("bash");
		expect(result).not.toContain("read");
		hasIdx(result, 5);
	});

	it("工具名不存在时返回空结果", () => {
		const result = doMessages({
			payloadPath: "/tmp/test.json",
			toolName: "nonexistent_tool",
		});
		expect(result).toContain("没有匹配");
	});
});

// ════════════════════════════════════════════════════════════
// 组合 + 边缘
// ════════════════════════════════════════════════════════════

describe("doMessages — 组合参数和边缘情况", () => {
	beforeEach(() => mockReadJsonFile.mockReset());

	it("msgIndex + msgRange 同时传时优先用 msgIndex", () => {
		mockReadJsonFile.mockReturnValue(
			makePayload([msg("user", "hi"), msg("assistant", "hello")]),
		);
		const result = doMessages({
			payloadPath: "/tmp/test.json",
			msgIndex: 0,
			msgRange: "0-1",
		});
		hasIdx(result, 0);
		expect(result).toContain("hi");
	});

	it("grep + toolName 同时传时取交集", () => {
		mockReadJsonFile.mockReturnValue(
			makePayload([
				tc("tc1", "read", '{"path":"a.ts"}'),
				tr("tc1", "content of a with keyword MATCH"),
				tc("tc2", "read", '{"path":"b.ts"}'),
				tr("tc2", "content of b without the word"),
				tc("tc3", "bash", '{"command":"grep MATCH"}'),
				tr("tc3", "found MATCH here"),
			]),
		);
		const result = doMessages({
			payloadPath: "/tmp/test.json",
			grep: "MATCH",
			toolName: "read",
		});
		hasIdx(result, 1);
		noIdx(result, 3);
		noIdx(result, 5);
	});

	it("content 为 null 的消息不崩溃", () => {
		mockReadJsonFile.mockReturnValue(
			makePayload([
				{ role: "assistant", content: null, tool_calls: [] },
				{ role: "assistant", content: null },
			]),
		);
		const result = doMessages({ payloadPath: "/tmp/test.json" });
		hasIdx(result, 0);
		hasIdx(result, 1);
	});

	it("content 为数组格式（pi 内部格式）", () => {
		mockReadJsonFile.mockReturnValue(
			makePayload([
				{
					role: "assistant",
					content: [
						{ type: "text", text: "Here is the result:" },
						{
							type: "toolCall",
							id: "tc1",
							name: "bash",
							arguments: { cmd: "ls" },
						},
					],
				},
			]),
		);
		const result = doMessages({ payloadPath: "/tmp/test.json" });
		hasIdx(result, 0);
		expect(result).toContain("Here is the result:");
	});

	it("单条消息的 payload + msgRange last:1 正常", () => {
		mockReadJsonFile.mockReturnValue(
			makePayload([msg("user", "only one message")]),
		);
		const result = doMessages({
			payloadPath: "/tmp/test.json",
			msgRange: "last:1",
		});
		hasIdx(result, 0);
		expect(result).toContain("only one message");
	});

	it("content 为数字不崩溃", () => {
		mockReadJsonFile.mockReturnValue(
			makePayload([{ role: "user", content: 42 }]),
		);
		const result = doMessages({ payloadPath: "/tmp/test.json" });
		hasIdx(result, 0);
		expect(result).toContain("42");
	});

	it("tool_calls 中缺少 function 字段不崩溃", () => {
		mockReadJsonFile.mockReturnValue(
			makePayload([
				{ role: "assistant", tool_calls: [{ id: "tc1" }], content: null },
				{ role: "tool", tool_call_id: "tc1", content: "result" },
			]),
		);
		const result = doMessages({ payloadPath: "/tmp/test.json" });
		hasIdx(result, 0);
	});

	it("tool result 的 tool_call_id 不匹配任何 tool_call 时返回匹配的 assistant 消息", () => {
		mockReadJsonFile.mockReturnValue(
			makePayload([
				tc("tc1", "read", '{"path":"a.ts"}'),
				tr("tc_unknown", "orphan result"),
			]),
		);
		const result = doMessages({
			payloadPath: "/tmp/test.json",
			toolName: "read",
		});
		// 增强匹配后，assistant 消息含 read tool_call 也被匹配
		hasIdx(result, 0);
	});
});
