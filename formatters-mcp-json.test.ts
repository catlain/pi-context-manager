/**
 * Godot MCP 工具结果格式化器测试
 *
 * 验证 Godot MCP 工具（game_query, scene_snapshot 等）的 JSON 输出
 * 被正确嗅探和压缩。
 *
 * 背景：game_query 的 get_tree 返回 JSON.stringify(sceneTree, null, 2)，
 * 场景树可能包含大量节点数据，需要智能压缩。
 */

import { describe, expect, it } from "vitest";
import {
	formatMcpJsonResult,
	sniffMcpJson,
} from "./formatters-mcp-json.js";

// ── 嗅探 ────────────────────────────────────────

describe("sniffMcpJson", () => {
	it("识别 Godot MCP 场景树 JSON（含 children 递归结构）", () => {
		const sceneTree = JSON.stringify({
			status: "success",
			data: {
				root: {
					type: "Node3D",
					name: "Root",
					children: [
						{ type: "Camera3D", name: "Camera", path: "Root/Camera" },
					],
				},
			},
		});
		expect(sniffMcpJson(sceneTree)).toBe(true);
	});

	it("识别 Godot MCP 节点属性 JSON（含 type + properties）", () => {
		const nodeProps = JSON.stringify({
			status: "success",
			data: {
				type: "CharacterBody3D",
				name: "Player",
				properties: {
					position: { x: 1, y: 2, z: 3 },
					velocity: { x: 0, y: 0, z: 0 },
				},
			},
		});
		expect(sniffMcpJson(nodeProps)).toBe(true);
	});

	it("不误判普通 JSON", () => {
		expect(sniffMcpJson('{"title":"hello","url":"https://example.com"}')).toBe(false);
	});

	it("不误判 code-graph AST JSON", () => {
		const astJson = JSON.stringify({
			name: "myFunc",
			type: "fn",
			file_path: "src/main.ts",
			signature: "() -> void",
			code_content: "function myFunc() {}",
		});
		expect(sniffMcpJson(astJson)).toBe(false);
	});

	it("不误判非 JSON 文本", () => {
		expect(sniffMcpJson("hello world")).toBe(false);
		expect(sniffMcpJson("")).toBe(false);
	});
});

// ── 压缩 ────────────────────────────────────────

describe("formatMcpJsonResult", () => {
	it("短 JSON 保持原样", () => {
		const shortJson = JSON.stringify({
			status: "success",
			data: { type: "Node3D", name: "Root" },
		});
		expect(formatMcpJsonResult(shortJson)).toBe(shortJson);
	});

	it("大型场景树压缩为摘要", () => {
		// 构造一个中型场景树：3 层嵌套
		const deepTree = buildLargeSceneTree(0, 3, 5); // 5*5*5 = 125 nodes
		const json = JSON.stringify({ status: "success", data: deepTree }, null, 2);

		// 确认输入足够大
		expect(json.length).toBeGreaterThan(5000);

		const result = formatMcpJsonResult(json);
		// 结果应比输入短很多
		expect(result.length).toBeLessThan(json.length * 0.5);
		// 应包含节点统计
		expect(result).toContain("nodes");
	});

	it("含 type + properties 的 JSON 保留非默认属性", () => {
		const json = JSON.stringify({
			status: "success",
			data: {
				type: "Node3D",
				name: "Player",
				properties: {
					position: { x: 1, y: 2, z: 3 },
					rotation: { x: 0, y: 0, z: 0 },  // 默认值
					scale: { x: 1, y: 1, z: 1 },      // 默认值
					visible: true,                      // 默认值
				},
			},
		}, null, 2);

		const result = formatMcpJsonResult(json);
		// 非默认值应保留
		expect(result).toContain("position");
	});

	it("非 MCP JSON 原样返回", () => {
		const normal = "this is not json at all";
		expect(formatMcpJsonResult(normal)).toBe(normal);
	});
});

// ── truncateLargeJson — 通用大 JSON 截断 ──────────

describe("formatMcpJsonResult — 通用大 JSON 截断", () => {
	it("大型 JSON（无 children/properties，但有 type）→ 行数截断", () => {
		// 构造一个通过 sniff 但没有 children/root/properties 的大型 JSON
		const longField = "x".repeat(200);
		const lines = Array.from(
			{ length: 150 },
			(_, i) => `"line_${i}": "${longField}"`,
		);
		const json = JSON.stringify({
			status: "success",
			data: {
				type: "Node3D",
				name: "BigNode",
				...(Object.fromEntries(lines.map((l, i) => [`f${i}`, longField]))),
			},
		}, null, 1);

		// 确认输入格式正确、长度触发了截断
		expect(json.length).toBeGreaterThan(2000);

		const result = formatMcpJsonResult(json);
		// 结果应包含 ... 和 truncated 提示
		expect(result).toContain("...");
		expect(result).toContain("truncated");
		// 结果应比输入短
		expect(result.length).toBeLessThan(json.length);
	});

	it("JSON 刚好 ≤ 80 行 → 不触发截断", () => {
		const fields = Array.from({ length: 50 }, (_, i) => `"k${i}": "v${i}"`).join(",\n");
		const json = `{\n${fields}\n}`;
		// 不满足 sniff 条件会被原样返回
		expect(formatMcpJsonResult(json)).toBe(json);
	});
});

// ── 嗅探补充 ─────────────────────────────────────

describe("sniffMcpJson 补充", () => {
	it("识别 status error 的 JSON", () => {
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
});

// ── 节点属性补充 ─────────────────────────────────

describe("formatMcpJsonResult — 节点属性补充", () => {
	it("多种默认值和非默认值混合 → 正确分离", () => {
		const json = JSON.stringify({
			status: "success",
			data: {
				type: "CharacterBody3D",
				name: "Player",
				properties: {
					visible: true,              // 默认
					position: { x: 0, y: 0, z: 0 },  // 默认
					velocity: { x: 5, y: 0, z: 0 },  // 非默认
					scale: { x: 1, y: 1, z: 1 },     // 默认
					custom_prop: "hello",            // 非默认
					null_prop: null,                  // 默认
				},
			},
		}, null, 2);

		const result = formatMcpJsonResult(json);
		expect(result).toContain("velocity");
		expect(result).toContain("custom_prop");
		// 默认属性应被标记为 omitted
		expect(result).toContain("Default properties omitted");
		expect(result).toContain("position");
	});

	it("children 在 data 直接（非 root 下）→ 场景树压缩", () => {
		const tree = {
			status: "success",
			data: {
				type: "Node3D",
				name: "Root",
				children: [
					{ type: "Camera3D", name: "Cam", path: "/Cam" },
					{ type: "MeshInstance3D", name: "Cube", path: "/Cube" },
				],
			},
		};
		// 数据小，不会触发截断
		const json = JSON.stringify(tree, null, 2);
		// 长度 ≤ 2000，返回原样
		expect(formatMcpJsonResult(json)).toBe(json);
	});

	it("data.children 的大场景树触发场景树压缩", () => {
		// 构造 data 下直接有 children 的大场景树
		const makeDeep = (depth: number): any => depth <= 0
			? { type: "MeshInstance3D", name: "Leaf", path: "R/L" }
			: { type: "Node3D", name: `L${depth}`, children: Array.from({ length: 4 }, () => makeDeep(depth - 1)) };

		const json = JSON.stringify({
			status: "success",
			data: makeDeep(4),
		}, null, 2);

		expect(json.length).toBeGreaterThan(2000);
		const result = formatMcpJsonResult(json);
		expect(result).toContain("Scene Tree Summary");
		expect(result).toContain("Total nodes");
	});

	it("空 properties → 格式化为空 JSON 对象", () => {
		const json = JSON.stringify({
			status: "success",
			data: { type: "Node3D", name: "Empty", properties: {} },
		}, null, 2);

		const result = formatMcpJsonResult(json);
		expect(result).toContain("Node: Empty");
		expect(result).toContain("non-default");
	});
});

// ── 空和边缘值 ───────────────────────────────────

describe("formatMcpJsonResult — 边缘值", () => {
	it("空字符串 → 返回空", () => {
		expect(formatMcpJsonResult("")).toBe("");
	});
});

// ── 辅助函数 ─────────────────────────────────────

function buildLargeSceneTree(
	branches: number,
	depth: number,
	width: number,
): any {
	if (depth <= 0) {
		return {
			type: "MeshInstance3D",
			name: "Leaf",
			path: "Root/.../Leaf",
			properties: {
				position: { x: Math.random() * 100, y: 0, z: Math.random() * 100 },
				visible: true,
			},
		};
	}
	return {
		type: "Node3D",
		name: `Branch_L${depth}`,
		path: `Root/.../Branch_L${depth}`,
		children: Array.from({ length: width }, (_, i) =>
			buildLargeSceneTree(branches, depth - 1, Math.max(2, width - 1)),
		),
	};
}
