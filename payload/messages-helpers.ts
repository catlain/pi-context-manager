/**
 * messages action 的辅助函数
 */

import { extractStringValues, matchToolName } from "@pi-atelier/shared-utils";
import type { PayloadMessage } from "../types-payload.js";
import type { ToolCallInfo } from "./core.js";
import { estTokens, fmtTok, getText } from "./core.js";

// ── 常量 ──

export const MAX_DETAIL_CHARS = 2000;
export const DEFAULT_SUMMARY_LIMIT = 50;

// ── 辅助函数 ──

/** 消息行摘要 */
export function summaryLine(
	i: number,
	m: PayloadMessage,
	toolIdx: Map<string, ToolCallInfo>,
): string {
	const role = m.role ?? "?";
	const text = getText(m.content);
	const tokens = estTokens(text);
	const tokStr = fmtTok(tokens).padStart(7);

	let extra = "";
	// tool result 消息显示工具名
	if (role === "tool" && m.tool_call_id) {
		const info = toolIdx.get(m.tool_call_id);
		if (info) extra = ` (${info.name})`;
	}
	// assistant 消息含 tool_calls 时显示工具名 + args 预览
	if (role === "assistant" && m.tool_calls?.length) {
		const calls = m.tool_calls
			.map((tc) =>
				tc.function
					? `${tc.function.name}(${(tc.function.arguments ?? "").slice(0, 40)})`
					: "?",
			)
			.join(", ");
		extra = ` → ${calls}`;
	}

	const preview = text.slice(0, 80).replace(/\n/g, "\\n") || "(empty)";
	return `[${String(i).padStart(4)}] ${role.padEnd(12)}${tokStr}tok${extra}  ${preview}`;
}

/** 消息详情（用于 msgIndex 模式） */
export function detailBlock(
	i: number,
	m: PayloadMessage,
	toolIdx: Map<string, ToolCallInfo>,
): string {
	const role = m.role ?? "?";
	const text = getText(m.content);
	const tokens = estTokens(text);

	const lines: string[] = [];
	lines.push(`┌─── [${i}] ${role} ${fmtTok(tokens)}tok ───`);

	// tool result 额外信息
	if (role === "tool" && m.tool_call_id) {
		const info = toolIdx.get(m.tool_call_id);
		if (info) lines.push(`│ 工具: ${info.name}`);
		lines.push(`│ tcId: ${m.tool_call_id}`);
	}
	// assistant tool_calls 信息
	if (role === "assistant" && m.tool_calls?.length) {
		for (const tc of m.tool_calls) {
			lines.push(
				`│ 调用: ${tc.function?.name ?? "?"}(${(tc.function?.arguments ?? "").slice(0, 80)})`,
			);
		}
	}

	const display =
		text.length > MAX_DETAIL_CHARS
			? text.slice(0, MAX_DETAIL_CHARS) +
				`\n... (截断，原文 ${text.length} 字符)`
			: text;
	for (const line of display.split("\n")) {
		lines.push(`│ ${line}`);
	}
	lines.push("└───");
	return lines.join("\n");
}

/** 解析 msgRange 字符串 */
export function parseRange(
	range: string,
	total: number,
): { start: number; end: number } | null {
	// "last:N"
	const lastM = range.match(/^last:(\d+)$/i);
	if (lastM) {
		const n = parseInt(lastM[1], 10);
		return { start: Math.max(0, total - n), end: total - 1 };
	}
	// "M-N"
	const rangeM = range.match(/^(\d+)-(\d+)$/);
	if (rangeM) {
		const s = parseInt(rangeM[1], 10);
		const e = parseInt(rangeM[2], 10);
		if (s > e) return null;
		return { start: s, end: Math.min(e, total - 1) };
	}
	return null;
}

/** 消息文本用于搜索（包含 tool call arguments） */
export function searchableText(m: PayloadMessage): string {
	const parts: string[] = [getText(m.content)];
	if (m.tool_calls) {
		for (const tc of m.tool_calls) {
			if (tc.function) {
				parts.push(tc.function.name ?? "");
				parts.push(tc.function.arguments ?? "");
			}
		}
	}
	return parts.join(" ");
}

/** 从消息的 tool_calls 中提取所有字符串参数值（用于 file 过滤） */
export function extractFilePaths(m: PayloadMessage): string[] {
	const paths: string[] = [];
	if (m.tool_calls) {
		for (const tc of m.tool_calls) {
			if (tc.function?.arguments) {
				try {
					const args =
						typeof tc.function.arguments === "string"
							? JSON.parse(tc.function.arguments)
							: tc.function.arguments;
					paths.push(...extractStringValues(args));
				} catch {
					/* invalid JSON, skip */
				}
			}
		}
	}
	return paths;
}

/** 检查消息是否匹配 toolName（增强匹配：精确/通配符/多值/前缀） */
export function matchesToolName(
	m: PayloadMessage,
	toolName: string,
	toolIdx: Map<string, ToolCallInfo>,
): boolean {
	// tool result 消息：通过 tool_call_id 查找工具名
	if (m.role === "tool" && m.tool_call_id) {
		const info = toolIdx.get(m.tool_call_id);
		return info ? matchToolName(toolName, info.name) : false;
	}
	// assistant 消息：检查 tool_calls
	if (m.role === "assistant" && m.tool_calls) {
		for (const tc of m.tool_calls) {
			if (tc.function && matchToolName(toolName, tc.function.name ?? "")) return true;
		}
	}
	return false;
}
