/**
 * messages 测试公共 mock
 */
import { vi } from "vitest";

export const mockReadJsonFile = vi.fn(() => null);

export function setupCoreMock() {
	vi.mock("../../payload/core.js", () => ({
		estTokens: (s: string) => Math.ceil(s.length / 4),
		fmtTok: (n: number) =>
			n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n),
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
						m.set(tc.id, {
							name: tc.function.name,
							argsStr: tc.function.arguments,
						});
					}
				}
			}
			return m;
		},
		readJsonFile: (...args: any[]) => mockReadJsonFile(...args),
		RECORDINGS_DIR: "/tmp/test-recordings",
		DISTILL_DIR: "/tmp/pi-distill",
	}));
}

/** 匹配索引标记 [N]（允许空格填充） */
export function hasIdx(result: string, n: number) {
	expect(result).toMatch(new RegExp(`\\[\\s*${n}\\s*\\]`));
}
export function noIdx(result: string, n: number) {
	expect(result).not.toMatch(new RegExp(`\\[\\s*${n}\\s*\\]`));
}

export function makePayload(msgs: any[]) {
	return { messages: msgs, model: "test-model" };
}
export function msg(
	role: string,
	content: string,
	extra: Record<string, any> = {},
) {
	return { role, content, ...extra };
}
export function tc(id: string, name: string, args: string) {
	return {
		role: "assistant",
		tool_calls: [{ id, function: { name, arguments: args } }],
		content: null,
	};
}
export function tr(id: string, content: string) {
	return { role: "tool", tool_call_id: id, content };
}
