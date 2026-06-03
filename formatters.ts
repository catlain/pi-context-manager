/**
 * 工具结果格式化纯函数
 *
 * 所有函数为纯函数签名：(text: string) => string
 * 输入原始文本，输出 AI 友好格式。
 * 解析/格式化失败时 fallback 返回原始文本。
 */

import { formatGhResult } from "./formatters-gh.js";
import {
	truncateAtParagraph,
	unwrapDoubleEncodedJson,
} from "./formatters-utils.js";
import {
	formatWebReadResult,
	formatWebSearchResult,
} from "./formatters-web.js";

export {
	formatGhResult,
	formatWebReadResult,
	formatWebSearchResult,
	truncateAtParagraph,
	unwrapDoubleEncodedJson,
};
// ── bash 格式化 ───────────────────────────────────

/**
 * bash 结果透传（bash 结果通常已由 truncateHead 截断）。
 */
export function formatBashResult(text: string): string {
	return text;
}

// formatMcpError 已迁移到 formatters-errors.ts（更完善的实现）
