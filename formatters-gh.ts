/**
 * gh_ 系列工具结果格式化
 *
 * 识别三种结构：
 * - gh_search_doc：results 数组 → 编号列表
 * - gh_read_file：content + path → 文件路径+内容
 * - gh_repo_structure：tree → 缩进树形
 * 未知结构 fallback 返回原始文本。
 */

// ── 内部类型 ──────────────────────────────────────

interface GhSearchDocResult {
	results?: Array<{ title?: string; url?: string; summary?: string }>;
}

interface GhReadFileResult {
	content?: string;
	path?: string;
}

interface GhTreeEntry {
	name?: string;
	type?: string;
	children?: GhTreeEntry[];
}

interface GhRepoStructureResult {
	tree?: GhTreeEntry[];
}

// ── 内部格式化函数 ─────────────────────────────────

function formatGhSearchDoc(data: GhSearchDocResult): string | null {
	if (!Array.isArray(data.results)) return null;
	if (data.results.length === 0) return "（共 0 条）";

	// 语义验证：至少一个条目必须有 gh 特征字段（title/url/summary），
	// 防止 code-graph ast_search 等工具的 {count, results} 被误匹配
	if (
		!data.results.some(
			(r) =>
				typeof r.title === "string" ||
				typeof r.url === "string" ||
				typeof r.summary === "string",
		)
	)
		return null;

	const lines: string[] = [];
	for (let i = 0; i < data.results.length; i++) {
		const r = data.results[i];
		const num = i + 1;
		lines.push(`[${num}] ${r.title ?? ""}`);
		if (r.url) lines.push(`    URL: ${r.url}`);
		if (r.summary) lines.push(`    ${r.summary}`);
	}
	return lines.join("\n");
}

function formatGhReadFile(data: GhReadFileResult): string | null {
	// 必须同时有 path 和 content — 只有 path 没有 content 的 JSON
	// 可能是 code-graph 的 module_overview / get_ast_node 等工具的结果
	// （它们也含 path 字段但不含 content）
	if (typeof data.path !== "string" || data.content == null) return null;
	const pathStr = `文件: ${data.path}`;
	const contentStr = data.content ?? "";
	return `${pathStr}\n\n${contentStr}`;
}

function formatGhTree(entries: GhTreeEntry[], indent: string = ""): string[] {
	const lines: string[] = [];
	for (const entry of entries) {
		if (entry.type === "directory") {
			lines.push(`${indent}${entry.name ?? "?"}/`);
			if (entry.children) {
				lines.push(...formatGhTree(entry.children, `${indent}  `));
			}
		} else {
			lines.push(`${indent}${entry.name ?? "?"}`);
		}
	}
	return lines;
}

function formatGhRepoStructure(data: GhRepoStructureResult): string | null {
	if (!Array.isArray(data.tree) || data.tree.length === 0) return null;
	return formatGhTree(data.tree).join("\n");
}

// ── 导出主函数 ─────────────────────────────────────

/**
 * 格式化 gh_ 系列工具结果。
 */
export function formatGhResult(text: string): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return text;
	}

	// JSON.parse 可能返回字符串/数字等原始类型（如双重编码 JSON），需要检查
	if (typeof parsed !== "object" || parsed === null) return text;
	const obj = parsed as Record<string, unknown>;

	// gh_read_file：必须含有 path 字段（gh 特征字段）
	// 不使用 "content" in obj——content 太通用，web_read 等工具也有 content 字段
	if ("path" in obj) {
		const formatted = formatGhReadFile(obj as GhReadFileResult);
		if (formatted !== null) return formatted;
	}

	// gh_search_doc：含有 results 字段
	if ("results" in obj) {
		const formatted = formatGhSearchDoc(obj as GhSearchDocResult);
		if (formatted !== null) return formatted;
	}

	// gh_repo_structure：含有 tree 字段
	if ("tree" in obj) {
		const formatted = formatGhRepoStructure(obj as GhRepoStructureResult);
		if (formatted !== null) return formatted;
	}

	return text;
}
