/**
 * messages.ts 增强过滤测试 — toolName 通配符/多值 + file 过滤 + 组合
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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
					if (tc.function) {
						m.set(tc.id, { name: tc.function.name, argsStr: tc.function.arguments });
					}
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

function makePayload(msgs: any[]) { return { messages: msgs, model: "test" }; }
function tc(id: string, name: string, args: string) {
	return { role: "assistant", tool_calls: [{ id, function: { name, arguments: args } }], content: null };
}
function tr(id: string, content: string) { return { role: "tool", tool_call_id: id, content }; }

function hasIdx(r: string, n: number) { expect(r).toMatch(new RegExp(`\\[\\s*${n}\\s*\\]`)); }
function noIdx(r: string, n: number) { expect(r).not.toMatch(new RegExp(`\\[\\s*${n}\\s*\\]`)); }

// ── toolName 增强匹配 ────────────────────────────────

describe("messages toolName 增强", () => {
	const payload = makePayload([
		tc("tc1", "code_graph_project_map", "{}"),
		tr("tc1", "map result"),
		tc("tc2", "code_graph_module_overview", '{"path":"src/core/"}'),
		tr("tc2", "overview result"),
		tc("tc3", "code_graph_find_references", '{"symbol_name":"foo"}'),
		tr("tc3", "refs result"),
		tc("tc4", "bash", '{"command":"npm test"}'),
		tr("tc4", "test output"),
	]);

	beforeEach(() => mockReadJsonFile.mockReturnValue(payload));

	it("通配符 code_graph* 匹配所有 code_graph 工具", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", toolName: "code_graph*" });
		hasIdx(result, 0);
		hasIdx(result, 2);
		hasIdx(result, 4);
		noIdx(result, 6);
	});

	it("通配符 code_graph_* 同样匹配", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", toolName: "code_graph_*" });
		hasIdx(result, 0);
		hasIdx(result, 2);
		hasIdx(result, 4);
		noIdx(result, 6);
	});

	it("多值 read|bash 匹配任一工具", () => {
		const payload2 = makePayload([
			tc("tc1", "read", '{"path":"a.ts"}'),
			tr("tc1", "content"),
			tc("tc2", "bash", '{"command":"ls"}'),
			tr("tc2", "output"),
			tc("tc3", "edit", '{"path":"b.ts"}'),
			tr("tc3", "ok"),
		]);
		mockReadJsonFile.mockReturnValue(payload2);
		const result = doMessages({ payloadPath: "/tmp/test.json", toolName: "read|bash" });
		hasIdx(result, 0);
		hasIdx(result, 2);
		noIdx(result, 4);
	});

	it("精确匹配 read 不匹配 read_file", () => {
		const payload2 = makePayload([
			tc("tc1", "read", '{"path":"a.ts"}'),
			tr("tc1", "content"),
			tc("tc2", "read_file", '{"path":"b.ts"}'),
			tr("tc2", "content"),
		]);
		mockReadJsonFile.mockReturnValue(payload2);
		const result = doMessages({ payloadPath: "/tmp/test.json", toolName: "read" });
		hasIdx(result, 0);
		noIdx(result, 2);
	});

	it("assistant 消息含匹配 tool_call 也会命中", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", toolName: "bash" });
		hasIdx(result, 6);
	});
});

// ── file 过滤 ────────────────────────────────────────

describe("messages file 过滤", () => {
	const payload = makePayload([
		tc("tc1", "read", '{"path":"src/core/engine.ts"}'),
		tr("tc1", "engine content"),
		tc("tc2", "edit", '{"path":"src/config/settings.json","old":"a","new":"b"}'),
		tr("tc2", "edited settings"),
		tc("tc3", "read", '{"path":"tests/engine.ts"}'),
		tr("tc3", "test content"),
		tc("tc4", "bash", '{"command":"npm test"}'),
		tr("tc4", "output"),
	]);

	beforeEach(() => mockReadJsonFile.mockReturnValue(payload));

	it("按文件名子串过滤", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", file: "engine.ts" });
		hasIdx(result, 0);
		noIdx(result, 2);
		hasIdx(result, 4);
		noIdx(result, 6);
		noIdx(result, 1);
	});

	it("按路径前缀过滤", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", file: "src/core/" });
		hasIdx(result, 0);
		noIdx(result, 2);
		noIdx(result, 4);
	});

	it("按通配符 *.json 过滤", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", file: "*.json" });
		hasIdx(result, 2);
		noIdx(result, 0);
		noIdx(result, 4);
	});

	it("多值 engine.ts|settings.json 过滤", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", file: "engine.ts|settings.json" });
		hasIdx(result, 0);
		hasIdx(result, 2);
		hasIdx(result, 4);
		noIdx(result, 6);
		noIdx(result, 1);
	});

	it("不匹配时返回空结果", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", file: "nonexistent.xyz" });
		expect(result).toContain("没有匹配");
	});
});

// ── 组合过滤 ─────────────────────────────────────────

describe("messages 组合过滤", () => {
	const payload = makePayload([
		tc("tc1", "edit", '{"path":"src/core/engine.ts","old":"foo","new":"bar"}'),
		tr("tc1", "edited engine"),
		tc("tc2", "edit", '{"path":"src/config/settings.json","old":"a","new":"b"}'),
		tr("tc2", "edited settings"),
		tc("tc3", "read", '{"path":"src/core/engine.ts"}'),
		tr("tc3", "engine content"),
		tc("tc4", "bash", '{"command":"npm test"}'),
		tr("tc4", "test output"),
	]);

	beforeEach(() => mockReadJsonFile.mockReturnValue(payload));

	it("toolName + file 同时过滤", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", toolName: "edit", file: "engine.ts" });
		hasIdx(result, 0);
		noIdx(result, 2);
		noIdx(result, 4);
	});

	it("toolName + grep 组合", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", toolName: "edit*", grep: "settings" });
		hasIdx(result, 2);
		noIdx(result, 0);
	});

	it("file + grep 组合", () => {
		// index 2 的 args 含 settings.json 和 "new":"b"
		const result = doMessages({ payloadPath: "/tmp/test.json", file: "settings.json", grep: '"new"' });
		hasIdx(result, 2);
		noIdx(result, 0);
	});

	it("toolName + file + grep 三重过滤", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", toolName: "edit", file: "engine.ts", grep: "bar" });
		hasIdx(result, 0);
		noIdx(result, 2);
		noIdx(result, 4);
	});

	it("无匹配的组合返回空", () => {
		const result = doMessages({ payloadPath: "/tmp/test.json", toolName: "bash", file: "engine.ts" });
		expect(result).toContain("没有匹配");
	});
});
