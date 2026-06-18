/**
 * code-graph JSON 输出 — 嗅探 + 格式化分派
 *
 * 嗅探 code-graph 工具的 JSON 格式输出，分派到具体格式化函数。
 * 格式化函数在 formatters-codegraph-json-fmt.ts 中实现。
 */

import {
	formatAstSearchJson,
	formatCallGraphJson,
	formatModuleOverviewJson,
	formatProjectMapJson,
	formatReferencesJson,
	formatSearchJson,
} from "./formatters-codegraph-json-fmt.js";
import type {
	AstSearchResult,
	CallGraphNode,
	ModuleOverviewResult,
	ProjectMapResult,
	ReferencesResult,
	SearchResultItem,
} from "./formatters-codegraph-json-fmt.js";

const MAX_LINES = 200;

// ── 嗅探 ─────────────────────────────────────────

/**
 * 检测 code-graph 工具的通用 JSON 输出
 *
 * 覆盖：semantic_code_search、get_call_graph、find_references、
 * module_overview、project_map、ast_search
 */
export function sniffCodeGraphJson(text: string): boolean {
	const trimmed = text.trimStart();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;

	let obj: unknown;
	try {
		obj = JSON.parse(text);
	} catch {
		return false;
	}

	// semantic_code_search: [{name, file_path, ...}]
	if (Array.isArray(obj)) {
		return (
			obj.length > 0 &&
			typeof obj[0]?.name === "string" &&
			typeof obj[0]?.file_path === "string" &&
			(typeof obj[0]?.type === "string" ||
				typeof obj[0]?.code_content === "string")
		);
	}

	const o = obj as Record<string, unknown>;

	// get_call_graph: {function, callers, callees}
	if (
		typeof o.function === "string" &&
		Array.isArray(o.callers) &&
		Array.isArray(o.callees)
	)
		return true;

	// find_references: {symbol, total_references, references}
	if (
		typeof o.symbol === "string" &&
		typeof o.total_references === "number" &&
		Array.isArray(o.references)
	)
		return true;

	// module_overview: {active_exports, files_count, path}
	if (
		Array.isArray(o.active_exports) &&
		typeof o.files_count === "number" &&
		typeof o.path === "string"
	)
		return true;

	// project_map: {modules, hot_functions, module_dependencies}
	if (
		Array.isArray(o.modules) &&
		Array.isArray(o.hot_functions) &&
		Array.isArray(o.module_dependencies)
	)
		return true;

	// ast_search: {count, results:[{name, file_path, ...}]}
	if (
		typeof o.count === "number" &&
		Array.isArray(o.results) &&
		(typeof (o.results as Array<{ name?: string }>)[0]?.name === "string" ||
			(o.results as unknown[]).length === 0)
	)
		return true;

	return false;
}

// ── 格式化分派 ───────────────────────────────────

/** 分派 code-graph JSON 到对应格式化器 */
export function formatCodeGraphJson(text: string): string {
	let obj: unknown;
	try {
		obj = JSON.parse(text);
	} catch {
		return text;
	}

	let formatted: string;

	const o = obj as Record<string, unknown>;

	if (Array.isArray(obj)) {
		formatted = formatSearchJson(obj as SearchResultItem[]);
	} else if (Array.isArray(o.callers) && Array.isArray(o.callees)) {
		formatted = formatCallGraphJson(obj as CallGraphNode);
	} else if (typeof o.symbol === "string" && Array.isArray(o.references)) {
		formatted = formatReferencesJson(obj as ReferencesResult);
	} else if (Array.isArray(o.active_exports)) {
		formatted = formatModuleOverviewJson(obj as ModuleOverviewResult);
	} else if (
		Array.isArray(o.modules) &&
		Array.isArray(o.module_dependencies)
	) {
		formatted = formatProjectMapJson(obj as ProjectMapResult);
	} else if (typeof o.count === "number" && Array.isArray(o.results)) {
		formatted = formatAstSearchJson(obj as AstSearchResult);
	} else {
		return text;
	}

	// 截断过长输出
	const lines = formatted.split("\n");
	if (lines.length > MAX_LINES) {
		formatted =
			lines.slice(0, MAX_LINES).join("\n") +
			`\n... (${lines.length - MAX_LINES} more lines)`;
	}

	return formatted;
}
