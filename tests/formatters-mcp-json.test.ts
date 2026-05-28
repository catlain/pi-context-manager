/**
 * formatters-mcp-json.ts 单元测试
 *
 * 覆盖：sniffMcpJson, formatMcpJsonResult, 场景树, 节点属性, truncateLargeJson
 */
import { describe, expect, it } from "vitest";
import {
	sniffMcpJson,
	formatMcpJsonResult,
} from "../formatters-mcp-json.js";

// ── sniff: 嗅探 ─────────────────────────────────────────────

describe("sniffMcpJson", () => {
	it("标准 MCP 场景树 → 识别", () => {
		const json = JSON.stringify({
			status: "success",
			data: { type: "Node3D", name: "Root", children: [] },
		});
		expect(sniffMcpJson(json)).toBe(true);
	});

	it("status error 的 JSON → 识别", () => {
		const json = JSON.stringify({
			status: "error",
			data: { type: "Node3D", name: "Broken", children: [] },
		});
		expect(sniffMcpJson(json)).toBe(true);
	});

	it("仅含 data.type（无 children/properties）→ 也识别", () => {
		const json = JSON.stringify({
			status: "success",
			data: { type: "Node3D", name: "Minimal" },
		});
		expect(sniffMcpJson(json)).toBe(true);
	});

	it("status 非 success/error → 不识别", () => {
		const json = JSON.stringify({
			status: "unknown",
			data: { type: "Node3D" },
		});
		expect(sniffMcpJson(json)).toBe(false);
	});

	it("不以 { 开头 → 不识别", () => {
		expect(sniffMcpJson("hello")).toBe(false);
	});

	it("JSON 解析失败 → 不识别", () => {
		expect(sniffMcpJson("{broken json")).toBe(false);
	});

	it("data 不是对象 → 不识别", () => {
		const json = JSON.stringify({ status: "success", data: "string" });
		expect(sniffMcpJson(json)).toBe(false);
	});

	it("排除 code-graph AST JSON（有 file_path + signature）", () => {
		const json = JSON.stringify({
			status: "success",
			data: { file_path: "src/main.ts", signature: "(x: number) => void" },
		});
		expect(sniffMcpJson(json)).toBe(false);
	});
});

// ── formatMcpJsonResult: 短 JSON 原样返回 ────────────────

describe("formatMcpJsonResult — 短 JSON", () => {
	it("简短 JSON（≤2000 字符）→ 原样返回", () => {
		const json = JSON.stringify({
			status: "success",
			data: { type: "Node3D", name: "Small" },
		});
		expect(formatMcpJsonResult(json)).toBe(json);
	});
});

// ── 场景树压缩 ────────────────────────────────────────────

describe("formatMcpJsonResult — 大场景树压缩", () => {
	it("深嵌套场景树 → 只保留前 2 层", () => {
		const root = buildTree(5, 3);
		const json = JSON.stringify({
			status: "success",
			data: root,
		}, null, 2);

		expect(json.length).toBeGreaterThan(2000);
		const result = formatMcpJsonResult(json);
		expect(result).toContain("Scene Tree Summary");
		expect(result).toContain("Total nodes");
		expect(result).toContain("nodes hidden");
	});

	it("children 在 data 直接（非 root）→ 也压缩", () => {
		const root = buildTree(4, 3);
		const json = JSON.stringify({
			status: "success",
			data: root,
		}, null, 2);

		expect(json.length).toBeGreaterThan(2000);
		const result = formatMcpJsonResult(json);
		expect(result).toContain("Scene Tree Summary");
	});

	it("节点无 name 字段 → 用 ? 占位", () => {
		const data = {
			type: "Node3D",
			children: [
				{ type: "Camera3D", children: [] },
			],
		};
		const json = JSON.stringify({ status: "success", data }, null, 2);
		expect(formatMcpJsonResult(json)).toBe(json);
	});
});

// ── 节点属性压缩 ──────────────────────────────────────────

describe("formatMcpJsonResult — 节点属性压缩", () => {
	it("混合默认/非默认属性 → 分离显示", () => {
		const json = makeLargePropertiesJson({
			visible: true,
			position: { x: 0, y: 0, z: 0 },
			velocity: { x: 5, y: 0, z: 0 },
			scale: { x: 1, y: 1, z: 1 },
			custom_prop: "hello",
			null_prop: null,
		});
		const result = formatMcpJsonResult(json);
		expect(result).toContain("velocity");
		expect(result).toContain("custom_prop");
		expect(result).toContain("Default properties omitted");
		expect(result).toContain("position");
	});

	it("空 properties → 格式化为空 JSON", () => {
		const json = makeLargePropertiesJson({});
		const result = formatMcpJsonResult(json);
		expect(result).toContain("Node: Empty");
		expect(result).toContain("non-default");
	});

	it("properties 中有 boolean false → 非默认值", () => {
		const json = makeLargePropertiesJson({ visible: false });
		const result = formatMcpJsonResult(json);
		expect(result).toContain("visible");
		expect(result).not.toContain("Default properties omitted");
	});

	it("properties 中有 number 非 0/1 → 非默认值", () => {
		const json = makeLargePropertiesJson({ speed: 42 });
		const result = formatMcpJsonResult(json);
		expect(result).toContain("42");
		expect(result).not.toContain("Default properties omitted");
	});
});

// ── 通用大 JSON 截断 ─────────────────────────────────────

describe("formatMcpJsonResult — 通用大 JSON 截断", () => {
	it("大型 JSON（type 有但无 children/properties）→ 行数截断", () => {
		const entry: Record<string, unknown> = {
			status: "success",
			data: { type: "Node3D", name: "Big" },
		};
		for (let i = 0; i < 150; i++) {
			entry[`f${i}`] = "x".repeat(50);
		}
		const json = JSON.stringify(entry, null, 1);

		expect(json.length).toBeGreaterThan(2000);
		const result = formatMcpJsonResult(json);
		expect(result).toContain("...");
		expect(result).toContain("truncated");
		expect(result.length).toBeLessThan(json.length);
	});

	it("JSON ≤80 行 → 不截断", () => {
		const json = JSON.stringify({ a: 1, b: 2, c: 3 }, null, 1);
		expect(formatMcpJsonResult(json)).toBe(json);
	});
});

// ── 非 MCP JSON ──────────────────────────────────────────

describe("formatMcpJsonResult — 非 MCP JSON", () => {
	it("非 JSON 字符串 → 原样返回", () => {
		expect(formatMcpJsonResult("this is not json")).toBe("this is not json");
	});

	it("空字符串 → 返回空", () => {
		expect(formatMcpJsonResult("")).toBe("");
	});
});

// ── 辅助函数 ─────────────────────────────────────────────

/** 构造嵌套场景树 */
function buildTree(depth: number, width: number): any {
	if (depth <= 0) {
		return { type: "MeshInstance3D", name: "Leaf", path: "R/Leaf" };
	}
	return {
		type: "Node3D",
		name: `L${depth}`,
		children: Array.from({ length: width }, () => buildTree(depth - 1, width)),
	};
}

/** 构造 > 2000 字符的 properties MCP JSON */
function makeLargePropertiesJson(
	properties: Record<string, unknown>,
): string {
	return JSON.stringify({
		status: "success",
		data: {
			type: "Node3D",
			name: "Empty",
			padding: "x".repeat(2500),
			properties,
		},
	}, null, 2);
}
