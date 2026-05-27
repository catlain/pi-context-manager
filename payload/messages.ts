/**
 * messages action — 按消息索引精确定位 payload 中的消息
 *
 * 支持：
 * - 无参数：全部消息摘要（自动截断）
 * - msgIndex: 查看第 N 条消息详情 + context 前后文
 * - msgRange: 范围查询（"5-10"、"last:5"）
 * - grep: 按关键词/正则搜索消息
 * - toolName: 按工具名过滤 tool result
 * - 组合：grep + toolName 取交集
 */

import {
	buildProviderToolCallIndex,
	readJsonFile,
} from "./core.js";
import {
	summaryLine, detailBlock, parseRange, searchableText,
	DEFAULT_SUMMARY_LIMIT,
} from "./messages-helpers.js";

// ── 接口 ──

export interface MessagesParams {
	payloadPath: string;
	msgIndex?: number;
	msgRange?: string;
	grep?: string;
	toolName?: string;
	context?: number;
}

// ── 主函数 ──

export function doMessages(params: MessagesParams): string {
	const { payloadPath, msgIndex, msgRange, grep, toolName, context = 3 } = params;

	const data = readJsonFile(payloadPath);
	if (!data) return `❌ 文件不存在: ${payloadPath}`;

	const msgs = data.messages ?? [];
	if (msgs.length === 0) return `没有消息 (${payloadPath})`;

	const toolIdx = buildProviderToolCallIndex(msgs);
	const total = msgs.length;

	// ── msgIndex 模式 ──
	if (msgIndex != null) {
		if (msgIndex < 0 || msgIndex >= total) {
			return `❌ msgIndex=${msgIndex} 越界，有效范围 [0, ${total - 1}]`;
		}

		const lines: string[] = [];
		lines.push(`消息 [${msgIndex}] / 共 ${total} 条\n`);

		// 前文
		const ctxStart = Math.max(0, msgIndex - context);
		if (ctxStart < msgIndex) {
			lines.push("── 前文 ──");
			for (let i = ctxStart; i < msgIndex; i++) {
				lines.push(summaryLine(i, msgs[i], toolIdx));
			}
		}

		// 目标消息详情
		lines.push("\n── 目标消息 ──");
		lines.push(detailBlock(msgIndex, msgs[msgIndex], toolIdx));

		// 后文
		const ctxEnd = Math.min(total - 1, msgIndex + context);
		if (ctxEnd > msgIndex) {
			lines.push("\n── 后文 ──");
			for (let i = msgIndex + 1; i <= ctxEnd; i++) {
				lines.push(summaryLine(i, msgs[i], toolIdx));
			}
		}

		return lines.join("\n");
	}

	// ── 收集要显示的消息索引 ──
	let indices: number[];

	if (msgRange) {
		const range = parseRange(msgRange, total);
		if (!range) return `❌ 无效 msgRange: "${msgRange}"（格式: "M-N" 或 "last:N"）`;
		indices = [];
		for (let i = range.start; i <= range.end; i++) indices.push(i);
	} else {
		indices = Array.from({ length: total }, (_, i) => i);
	}

	// ── 过滤 ──

	// grep 过滤
	if (grep) {
		let regex: RegExp;
		try {
			regex = new RegExp(grep, "i");
		} catch {
			return `❌ 无效正则: ${grep}`;
		}
		indices = indices.filter(i => regex.test(searchableText(msgs[i])));
	}

	// toolName 过滤：只保留匹配的 tool result 消息
	if (toolName) {
		indices = indices.filter(i => {
			const m = msgs[i];
			if (m.role !== "tool") return false;
			const info = toolIdx.get(m.tool_call_id ?? "");
			return info?.name === toolName;
		});
	}

	if (indices.length === 0) {
		return `没有匹配的消息（grep=${grep ?? "-"} toolName=${toolName ?? "-"}）`;
	}

	// ── 无参数全量模式：截断 ──
	if (!msgRange && !grep && !toolName) {
		const truncated = indices.length > DEFAULT_SUMMARY_LIMIT;
		const showIndices = truncated ? indices.slice(0, DEFAULT_SUMMARY_LIMIT) : indices;

		const lines: string[] = [`消息摘要: ${total} 条`];
		if (truncated) {
			lines.push(`（显示前 ${DEFAULT_SUMMARY_LIMIT} 条，用 msgRange="last:N" 查看末尾）\n`);
		}

		for (const i of showIndices) {
			lines.push(summaryLine(i, msgs[i], toolIdx));
		}

		if (truncated) {
			lines.push(`\n... 还有 ${indices.length - DEFAULT_SUMMARY_LIMIT} 条未显示`);
		}

		return lines.join("\n");
	}

	// ── 范围/过滤模式：显示摘要 ──
	const lines: string[] = [`匹配 ${indices.length} 条消息:\n`];
	for (const i of indices) {
		lines.push(summaryLine(i, msgs[i], toolIdx));
	}
	return lines.join("\n");
}
