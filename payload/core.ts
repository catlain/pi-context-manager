/**
 * payload-analyzer 核心解析函数
 *
 * 两种消息格式：
 * - provider 格式: role="tool", tool_call_id, content=string | [{type,text}]
 * - pi 内部格式:   role="toolResult", toolCallId, content=[{type,text}]
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { DISTILL_DIR } from "../shared.js";

export const RECORDINGS_DIR = join(DISTILL_DIR, "recordings");

// ── Token 估算 ──

export function estTokens(text: string): number {
	return Math.max(1, Math.ceil(text.length / 4));
}

export function fmtTok(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function fmtSize(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
	if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${bytes}B`;
}

// ── 文本提取 ──

export function getText(content: any): string {
	if (content == null) return "";
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((p: any) => typeof p === "object" && p.type === "text")
			.map((p: any) => p.text ?? "")
			.join("\n");
	}
	return String(content);
}

// ── Provider 格式 tool_call 索引 ──

export interface ToolCallInfo { name: string; argsStr: string }

export function buildProviderToolCallIndex(messages: any[]): Map<string, ToolCallInfo> {
	const idx = new Map<string, ToolCallInfo>();
	for (const m of messages) {
		if (m.role !== "assistant") continue;
		for (const tc of m.tool_calls ?? []) {
			idx.set(tc.id ?? "", {
				name: tc.function?.name ?? "unknown",
				argsStr: tc.function?.arguments ?? "",
			});
		}
	}
	return idx;
}

export function buildPiToolCallIndex(messages: any[]): Map<string, ToolCallInfo> {
	const idx = new Map<string, ToolCallInfo>();
	for (const m of messages) {
		if (m.role !== "assistant") continue;
		const content = Array.isArray(m.content) ? m.content : [];
		for (const block of content) {
			if (block.type === "toolCall") {
				idx.set(block.id ?? "", {
					name: block.name ?? "unknown",
					argsStr: typeof block.arguments === "string"
						? block.arguments
						: JSON.stringify(block.arguments ?? {}),
				});
			}
		}
	}
	return idx;
}

// ── 状态分类 ──

export function classifyStatus(text: string, threshold = 500): string {
	if (text.includes("[processed]")) return "TRUNCATED";
	if (estTokens(text) >= threshold) return "FULL_KEPT";
	return "SMALL";
}

// ── Distill header 解析 ──

export interface DistillHeader {
	tool: string;
	meta: string;
	origTokens: number;
	origLines: number;
	tmpPath: string;
}

const RE_DISTILL_HEADER = /^\[distilled (\w+)\]\s*(.*)/;
const RE_ORIG_TOKENS = /Original:\s*~?(\d+)\s*tokens/;
const RE_ORIG_LINES = /Original:.*?(\d+)\s*lines/;
const RE_TMP_PATH = /Full content:\s*(\S+)/;

export function parseDistillHeader(text: string): DistillHeader | null {
	const m1 = text.match(RE_DISTILL_HEADER);
	if (!m1) return null;
	const result: DistillHeader = {
		tool: m1[1], meta: m1[2].trim(),
		origTokens: 0, origLines: 0, tmpPath: "",
	};
	for (const line of text.split("\n").slice(1, 5)) {
		const mt = line.match(RE_ORIG_TOKENS);
		if (mt) result.origTokens = Number(mt[1]);
		const ml = line.match(RE_ORIG_LINES);
		if (ml) result.origLines = Number(ml[1]);
		const mp = line.match(RE_TMP_PATH);
		if (mp) result.tmpPath = mp[1];
	}
	return result;
}

// ── 参数解析 ──

export function parseArgs(argsStr: string): Record<string, any> {
	try { return JSON.parse(argsStr); }
	catch { return {}; }
}

export function extractReadPath(argsStr: string): string {
	return parseArgs(argsStr).path ?? parseArgs(argsStr).filePath ?? "";
}

// ── 文件 I/O ──

export function readJsonFile<T = any>(filepath: string): T | null {
	if (!existsSync(filepath)) return null;
	try { return JSON.parse(readFileSync(filepath, "utf-8")); }
	catch { return null; }
}

// ── 格式化输出 ──

export function formatToolStats(perTool: Record<string, {
	count: number; callTokens: number; resultTokens: number;
}>): string {
	if (!perTool || Object.keys(perTool).length === 0) return "";
	const lines = [
		"\n📊 按工具统计:",
		`   ${"Tool".padEnd(25)} ${"Calls".padStart(5)} ${"CallT".padStart(8)} ${"ResultT".padStart(8)} ${"Total".padStart(8)}`,
		`   ${"─".repeat(25)} ${"─".repeat(5)} ${"─".repeat(8)} ${"─".repeat(8)} ${"─".repeat(8)}`,
	];
	const sorted = Object.entries(perTool)
		.sort((a, b) => (b[1].callTokens + b[1].resultTokens) - (a[1].callTokens + a[1].resultTokens));
	for (const [name, s] of sorted) {
		const total = s.callTokens + s.resultTokens;
		lines.push(`   ${name.padEnd(25)} ${String(s.count).padStart(5)} ${fmtTok(s.callTokens).padStart(8)} ${fmtTok(s.resultTokens).padStart(8)} ${fmtTok(total).padStart(8)}`);
	}
	return lines.join("\n");
}
