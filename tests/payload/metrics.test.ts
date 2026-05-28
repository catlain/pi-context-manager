/**
 * payload/metrics.ts 单元测试
 *
 * 覆盖：doBudget, doGrowth
 * Mock getRecordingFiles + readJsonFile，测试纯格式化逻辑。
 */
import { describe, it, expect, vi } from "vitest";

// ── Mock 数据 ─────────────────────────────────────

const mockFiles = vi.hoisted(() => [
	{ filename: "req-0001-abc.json", path: "/fake/req-0001-abc.json" },
	{ filename: "req-0002-def.json", path: "/fake/req-0002-def.json" },
]);

const mockJsonData = vi.hoisted(() => ({
	"/fake/req-0001-abc.json": {
		model: "gpt-4",
		messages: [
			{
				role: "system",
				content: "You are a helpful assistant that follows instructions carefully.",
			},
			{ role: "user", content: "Hello" },
			{
				role: "assistant",
				content: "Hi there! How can I help you today?",
				tool_calls: [
					{
						id: "tc1",
						function: {
							name: "read_file",
							arguments: '{"path": "test.txt"}',
						},
					},
				],
			},
			{ role: "tool", tool_call_id: "tc1", content: "file content here" },
		],
		tools: [{ name: "read_file", description: "Read a file" }],
	},
	"/fake/req-0002-def.json": {
		model: "gpt-4",
		messages: [
			{
				role: "system",
				content: "You are a helpful assistant.",
			},
			{ role: "user", content: "What is the capital of France?" },
			{
				role: "assistant",
				content: "The capital of France is Paris.",
			},
		],
		tools: [],
	},
}));

const mockGetRecordingFiles = vi.hoisted(() => vi.fn());
const mockReadJsonFile = vi.hoisted(
	() => vi.fn((p: string) => mockJsonData[p] ?? null),
);
const mockListSessions = vi.hoisted(() => vi.fn(() => []));
const mockListRecordings = vi.hoisted(() => vi.fn(() => []));

vi.mock("../../payload/files.js", () => ({
	getRecordingFiles: mockGetRecordingFiles,
}));

vi.mock("../../payload/core.js", () => ({
	estTokens: (s: string) => Math.ceil(s.length / 4),
	fmtTok: (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)),
	getText: (c: any) =>
		typeof c === "string"
			? c
			: Array.isArray(c)
				? c.filter((p: any) => p.type === "text").map((p: any) => p.text ?? "").join("\n")
				: "",
	readJsonFile: mockReadJsonFile,
	RECORDINGS_DIR: "/fake/recordings",
	listSessions: mockListSessions,
	listRecordings: mockListRecordings,
}));

import { doBudget, doGrowth } from "../../payload/metrics.js";

// ══════════════════════════════════════════════════
// doBudget
// ══════════════════════════════════════════════════

describe("doBudget", () => {
	it("无录制文件时返回提示", () => {
		mockGetRecordingFiles.mockReturnValueOnce(null);
		const r = doBudget();
		expect(r).toContain("没找到");
		expect(r).toContain("req-*.json");
	});

	it("无录制文件时返回提示（含 sessionId）", () => {
		mockGetRecordingFiles.mockReturnValueOnce(null);
		const r = doBudget("session-abc");
		expect(r).toContain("没找到");
		expect(r).toContain("session-abc");
	});

	it("正常输出包含表头和合计行", () => {
		mockGetRecordingFiles.mockReturnValue(mockFiles);
		const r = doBudget();
		expect(r).toContain("Token 预算分析");
		expect(r).toContain("Req");
		expect(r).toContain("0001");
		expect(r).toContain("0002");
		expect(r).toContain("合计");
	});

	it("空文件列表返回空数据表", () => {
		mockGetRecordingFiles.mockReturnValue([]);
		const r = doBudget();
		expect(r).toContain("Token 预算分析");
	});
});

// ══════════════════════════════════════════════════
// doGrowth
// ══════════════════════════════════════════════════

describe("doGrowth", () => {
	it("无录制文件时返回提示", () => {
		mockGetRecordingFiles.mockReturnValueOnce(null);
		const r = doGrowth();
		expect(r).toContain("没找到");
	});

	it("无录制文件时返回提示（含 sessionId）", () => {
		mockGetRecordingFiles.mockReturnValueOnce(null);
		const r = doGrowth("session-abc");
		expect(r).toContain("session-abc");
	});

	it("正常输出包含增长数据", () => {
		mockGetRecordingFiles.mockReturnValue(mockFiles);
		const r = doGrowth();
		expect(r).toContain("上下文增长趋势");
		expect(r).toContain("0001");
		expect(r).toContain("0002");
		expect(r).toContain("起始");
		expect(r).toContain("终止");
		expect(r).toContain("总增长");
	});

	it("delta 为 0 时显示 -", () => {
		const singleFile = [mockFiles[0]];
		mockGetRecordingFiles.mockReturnValue(singleFile);
		const r = doGrowth();
		expect(r).toContain("-");
	});

	it("delta 为正时显示 + 号", () => {
		const changingData = vi.hoisted(() => [
			{
				filename: "req-0001-abc.json",
				path: "/fake/chg-0001.json",
			},
			{
				filename: "req-0002-abc.json",
				path: "/fake/chg-0002.json",
			},
		]);

		mockJsonData["/fake/chg-0001.json"] = {
			model: "gpt-4",
			messages: [
				{ role: "user", content: "Hi" },
				{ role: "assistant", content: "Hello" },
			],
		};
		mockJsonData["/fake/chg-0002.json"] = {
			model: "gpt-4",
			messages: [
				{ role: "user", content: "Hi" },
				{ role: "assistant", content: "Hello" },
				// additional content for larger total
				{
					role: "assistant",
					content: "Here is a longer response with more tokens used.",
					tool_calls: [
						{
							id: "tc1",
							function: {
								name: "search",
								arguments: '{"q": "test"}',
							},
						},
					],
				},
				{
					role: "tool",
					tool_call_id: "tc1",
					content: "search result data here with lots of content",
				},
			],
		};

		mockGetRecordingFiles.mockReturnValue(changingData);
		const r = doGrowth();
		expect(r).toContain("+");
		expect(r).toContain("+42");
	});

	it("delta 为负时显示减号（数据缩减）", () => {
		const shrinkingData = vi.hoisted(() => [
			{
				filename: "req-0001-abc.json",
				path: "/fake/shr-0001.json",
			},
			{
				filename: "req-0002-abc.json",
				path: "/fake/shr-0002.json",
			},
		]);

		mockJsonData["/fake/shr-0001.json"] = {
			model: "gpt-4",
			messages: [
				{ role: "user", content: "Hi" },
				{
					role: "assistant",
					content: "Long response with many tokens here for the first request",
				},
				{
					role: "assistant",
					content: "more content to make the total even larger",
					tool_calls: [
						{
							id: "tc1",
							function: {
								name: "read",
								arguments: "{}",
							},
						},
					],
				},
				{
					role: "tool",
					tool_call_id: "tc1",
					content: "some data that adds to the token count substantially",
				},
			],
		};
		mockJsonData["/fake/shr-0002.json"] = {
			model: "gpt-4",
			messages: [
				{ role: "user", content: "Hi" },
				{ role: "assistant", content: "Short" },
			],
		};

		mockGetRecordingFiles.mockReturnValue(shrinkingData);
		const r = doGrowth();
		expect(r).toContain("-");
		expect(r).toContain("总增长: -");
	});
});
