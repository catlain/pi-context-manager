/**
 * Godot MCP JSON 类型定义
 *
 * MCP 工具（Godot MCP 等）返回的 JSON 结构类型。
 */

export interface GodotSceneNode {
	name?: string;
	type?: string;
	path?: string;
	children?: GodotSceneNode[];
	[key: string]: unknown;
}

export interface GodotMcpResponse {
	status: "success" | "error";
	data: GodotSceneNode & {
		root?: GodotSceneNode;
		children?: GodotSceneNode[];
		properties?: Record<string, unknown>;
	};
}

export interface PrunedNode {
	name: string;
	type: string;
	path?: string;
	children?: PrunedNode[] | string;
}

export interface TreeStats {
	nodes: number;
	maxDepth: number;
	types: Record<string, number>;
}

export interface NodeCountStats {
	nodes: number;
}
