/**
 * payload/files.ts 单元测试 — 时间线收集部分
 *
 * 覆盖：collectTimeline, collectTimelineByTcId
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockReadJsonFile = vi.hoisted(() => vi.fn());

vi.mock("../../payload/core.js", () => ({
	estTokens: (s: string) => Math.ceil(s.length / 4),
	getText: (c: any) =>
		typeof c === "string"
			? c
			: Array.isArray(c)
				? c.filter((p: any) => p.type === "text")
						.map((p: any) => p.text ?? "")
						.join("\n")
				: "",
	readJsonFile: mockReadJsonFile,
	classifyStatus: (s: string, threshold = 500) =>
		s.includes("[processed]")
			? "TRUNCATED"
			: Math.ceil(s.length / 4) >= threshold
				? "FULL_KEPT"
				: "SMALL",
	buildProviderToolCallIndex: (msgs: any[]) => {
		const idx = new Map<string, any>();
		for (const m of msgs) {
			if (m.role !== "assistant") continue;
			for (const tc of m.tool_calls ?? []) {
				idx.set(tc.id, {
					name: tc.function?.name ?? "unknown",
					argsStr: tc.function?.arguments ?? "",
				});
			}
		}
		return idx;
	},
}));

import { collectTimeline, collectTimelineByTcId } from "../../payload/files.js";

const files = [
	{ filename: "req-0001-abc.json", path: "/fake/req-0001-abc.json" },
];

// ══════════════════════════════════════════════════
// collectTimeline
// ══════════════════════════════════════════════════

describe("collectTimeline", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("无 tool 消息 → 空 map", () => {
		mockReadJsonFile.mockReturnValue({
			messages: [{ role: "user", content: "hi" }],
		});
		const map = collectTimeline(files);
		expect(map.size).toBe(0);
	});

	it("有 tool 消息 → 按 name:argsSig 分组", () => {
		mockReadJsonFile.mockReturnValue({
			messages: [
				{
					role: "assistant",
					tool_calls: [
						{
							id: "tc1",
							function: { name: "read_file", arguments: '{"path":"a.txt"}' },
						},
						{
							id: "tc2",
							function: { name: "write_file", arguments: '{"path":"b.txt"}' },
						},
					],
				},
				{ role: "tool", tool_call_id: "tc1", content: "file a content" },
				{ role: "tool", tool_call_id: "tc2", content: "written ok" },
			],
		});
		const map = collectTimeline(files);
		expect(map.size).toBe(2);
		const key1 = Array.from(map.keys()).find((k) => k.startsWith("read_file"));
		const key2 = Array.from(map.keys()).find((k) => k.startsWith("write_file"));
		expect(key1).toBeTruthy();
		expect(key2).toBeTruthy();
		expect(map.get(key1!)).toHaveLength(1);
		expect(map.get(key2!)).toHaveLength(1);
	});

	it("tool_call_id 查询不到 → 使用 tcId 作为 argsStr", () => {
		mockReadJsonFile.mockReturnValue({
			messages: [{ role: "tool", tool_call_id: "orphan-tcid", content: "result" }],
		});
		const map = collectTimeline(files);
		expect(map.size).toBe(1);
		const key = Array.from(map.keys()).find((k) => k.includes("orphan-tcid"));
		expect(key).toBeTruthy();
	});
});

// ══════════════════════════════════════════════════
// collectTimelineByTcId
// ══════════════════════════════════════════════════

describe("collectTimelineByTcId", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("按 tool_call_id 分组", () => {
		mockReadJsonFile.mockReturnValue({
			messages: [
				{
					role: "assistant",
					tool_calls: [{ id: "tc1", function: { name: "read", arguments: "{}" } }],
				},
				{ role: "tool", tool_call_id: "tc1", content: "data" },
			],
		});
		const map = collectTimelineByTcId(files);
		expect(map.size).toBe(1);
		expect(map.has("tc1")).toBe(true);
	});

	it("空 tool_call_id 跳过", () => {
		mockReadJsonFile.mockReturnValue({
			messages: [{ role: "tool", tool_call_id: "", content: "empty" }],
		});
		const map = collectTimelineByTcId(files);
		expect(map.size).toBe(0);
	});

	it("无 tool 消息 → 空 map", () => {
		mockReadJsonFile.mockReturnValue({
			messages: [{ role: "user", content: "hi" }],
		});
		const map = collectTimelineByTcId(files);
		expect(map.size).toBe(0);
	});
});
