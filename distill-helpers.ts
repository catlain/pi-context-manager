import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isArchDocPath,
	isOpenspecDesignDocPath,
	isSkillMdPath,
} from "@pi-atelier/shared-utils";
import { estimateTokens as estimateTokensImpl } from "@pi-atelier/shared-utils";
import type { PayloadContentBlock, PayloadMessage } from "./types-payload.js";
import { formatTokens } from "./utils.js";

// ── toolCall 映射 ──

/** 从 assistant 消息中提取 toolCall 映射（pi 内部格式：type="toolCall", id, name, arguments） */
export function buildToolCallMap(
	messages: PayloadMessage[],
): Map<string, { name: string; arguments: Record<string, unknown> }> {
	const map = new Map<string, { name: string; arguments: Record<string, unknown> }>();
	for (const msg of messages) {
		if (msg.role !== "assistant") continue;
		for (const block of Array.isArray(msg.content) ? msg.content : []) {
			if (block.type === "toolCall" && block.id) {
				map.set(block.id, {
					name: block.name ?? "unknown",
					arguments: (block.arguments ?? {}) as Record<string, unknown>,
				});
			}
		}
	}
	return map;
}

/** 提取工具元信息：优先用 ToolResultMessage 自带的 toolName，再从 toolCallMap 查参数细节 */
export function toolMeta(
	msg: PayloadMessage,
	toolCallMap: Map<string, { name: string; arguments: Record<string, unknown> }>,
): { name: string; meta: string } {
	const name = msg.toolName || "unknown";
	const callId = msg.toolCallId || "";
	const info = toolCallMap.get(callId);
	const details = info?.arguments as Record<string, unknown> | undefined;
	switch (name) {
		case "read":
			return { name, meta: details?.path ? String(details.path) : "" };
		case "write":
			return { name, meta: details?.path ? String(details.path) : "" };
		case "edit":
			return { name, meta: details?.path ? String(details.path) : "" };
		case "bash":
			return {
				name,
				meta: details?.command
					? String(details.command).split("\n")[0].slice(0, 80)
					: "",
			};
		case "grep":
			return {
				name,
				meta: [details?.pattern, details?.path].filter(Boolean).join(" in "),
			};
		case "find":
			return { name, meta: details?.pattern ? String(details.pattern) : "" };
		case "ls":
			return { name, meta: details?.path ? String(details.path) : "" };
		default:
			return { name, meta: "" };
	}
}

// ── token 估算 ──

/** 估算 token 数（单一事实源：shared-utils tokens.ts，字符数/4 向上取整）
 *  本包内同名转发门面，消费方 import 路径不变。 */
export const estimateTokens = estimateTokensImpl;

// ── toolCall/toolResult 配对清理 ──

/** 清理孤立的 toolCall block（删除 toolResult 后必须调用） */
export function removeOrphanedToolCalls(messages: PayloadMessage[]): void {
	// 1. 收集所有剩余 toolResult 的 toolCallId
	const activeToolCallIds = new Set<string>();
	for (const msg of messages) {
		if (msg.role === "toolResult" && msg.toolCallId) {
			activeToolCallIds.add(msg.toolCallId);
		}
	}
	// 2. 从 assistant 消息中移除没有对应 toolResult 的 toolCall block
	for (const msg of messages) {
		if (msg.role === "assistant" && Array.isArray(msg.content)) {
			if (!msg.content.some((b: PayloadContentBlock) => b.type === "toolCall"))
				continue;
			msg.content = msg.content.filter(
				(b: PayloadContentBlock) =>
					b.type !== "toolCall" || activeToolCallIds.has(b.id ?? ""),
			);
		}
	}
	// 3. 删除内容为空的 assistant 消息（toolCall 全部移除且无 text/thinking）
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (
			m.role === "assistant" &&
			Array.isArray(m.content) &&
			m.content.length === 0
		) {
			messages.splice(i, 1);
		}
	}
}

// ── 以下函数保留供 index.test.ts 使用（旧蒸馏逻辑的辅助函数） ──

/** 按工具类型提取关键参数作为去重签名 */
export function buildArgsSignature(
	name: string,
	args: Record<string, unknown> | undefined,
): string {
	if (!args) return "";
	switch (name) {
		case "read":
		case "edit":
		case "write":
			return String(args.path || "");
		case "bash":
			return String(args.command || "")
				.split("\n")[0]
				.slice(0, 80);
		case "grep":
			return [args.pattern, args.path].filter(Boolean).join(" in ");
		case "find":
			return String(args.pattern || "");
		case "ls":
			return String(args.path || "");
		default:
			return "";
	}
}

/** 生成固定 tmp 文件路径（按参数签名去重） */
export function buildTmpPath(
	toolName: string,
	argsSignature: string,
	distillDir: string = join(tmpdir(), "pi-distill"),
): string {
	const hash = argsSignature
		? createHash("sha256").update(argsSignature).digest("hex").slice(0, 8)
		: "no-sig";
	return join(distillDir, `${toolName}-${hash}.txt`);
}

/** 生成带元信息的 tmp 文件内容 */
export function formatTmpContent(
	meta: { name: string; meta: string },
	origLines: string[],
	origTokens: number,
): string {
	const header = meta.meta
		? `=== [distilled ${meta.name}] ${meta.meta} ===`
		: `=== [distilled ${meta.name}] ===`;
	const ts = new Date().toISOString().replace("T", " ").slice(0, 16);
	const size = `Original: ~${formatTokens(origTokens)} tokens, ${origLines.length} lines`;
	return `${header}\nUpdated: ${ts}\n${size}\n\n${origLines.join("\n")}`;
}

/** 生成摘要文本：元信息 + 前 N 行预览 + 临时文件路径 */
export function buildSummary(
	info: { name: string; meta: string },
	origLines: string[],
	tmpPath: string,
	origTokens: number,
	previewLines: number,
): string {
	const header = info.meta
		? `[distilled ${info.name}] ${info.meta}`
		: `[distilled ${info.name}]`;
	const size = `Original: ${origTokens} tokens (~${formatTokens(origTokens)}), ${origLines.length} lines`;
	const preview = origLines
		.slice(0, previewLines)
		.map((l, i) => `${(i + 1).toString().padStart(3)} ${l}`)
		.join("\n");
	const more =
		origLines.length > previewLines
			? `\n... (${origLines.length - previewLines} more lines)`
			: "";
	return `${header}\n${size}\nFull content: ${tmpPath}\n\n${preview}${more}`;
}

// ── 保护文档清单（单一事实源：@pi-atelier/shared-utils）──
// 谓词语义见 shared-utils/src/protected-docs.ts：技能入口 SKILL.md（任意目录树，含 .agents/git 包）、
// openspec/changes/{change}/design.md、docs/agent/ 架构宪法文档。
// 相对旧本地实现的行为变化（设计声明）：技能目录非 SKILL.md 文件（模板等）不再豁免（收窄）；
// .agents 等非 .pi 树的 skills/{name}/SKILL.md 新增豁免（扩齐）；相对路径 SKILL.md 保持命中。

// 本地历史导出名收敛：别名已删（归档审计 S3），统一转发原名，
// 下游 import 统一使用 isSkillMdPath / isOpenspecDesignDocPath / isArchDocPath
export { isArchDocPath, isOpenspecDesignDocPath, isSkillMdPath };

// ── aging 策略选择（纯函数，便于独立测试） ──

/** aging 决策上下文：一个 toolResult 的关键字段 */
export interface AgingContext {
	toolName: string;
	isError: boolean;
	tokens: number;
	filePath?: string;
}

/** 判断是否完全跳过 aging（不累加计数、不进 firstSeenCap）。
 *  现有规则：read 命中 skill / openspec changes design.md / 架构宪法文档
 *  （ADR、INVARIANTS、Design Note）路径。
 *  注意：edit/write 不在此豁免——与所有工具一样走 selectAgingThreshold 的
 *  统一阈值（unify-aging-edit-write 后无永生路径）。 */
export function isAgingExempt(ctx: AgingContext): boolean {
	if (
		ctx.toolName === "read" &&
		(isSkillMdPath(ctx.filePath) ||
			isOpenspecDesignDocPath(ctx.filePath) ||
			isArchDocPath(ctx.filePath))
	)
		return true;
	return false;
}

/** aging 策略所需配置字段的精简接口（selectAgingThreshold 只读这个字段集合） */
export interface AgingConfig {
	distillThreshold: number;
	agingThreshold: number;
	errorAgingThreshold: number;
	largeResultAging: number;
}

/** 选择有效 aging 阈值（轮数）。
 *  优先级：大文件（A）> 错误结果（B）> 普通轮数（C），对所有工具一致（含 edit/write，
 *  unify-aging-edit-write 取代了旧的 edit/write 永生豁免）。
 *  返回 ≤0 表示该策略被禁用（配置关闭）。 */
export function selectAgingThreshold(
	ctx: AgingContext,
	cfg: AgingConfig,
): number {
	// A（大文件）：对所有工具（含 edit/write）生效，保持原有 A>B 优先级
	if (ctx.tokens >= cfg.distillThreshold && cfg.largeResultAging > 0)
		return cfg.largeResultAging;
	// B（出错）：非大文件的错误结果走加速淘汰
	if (ctx.isError && cfg.errorAgingThreshold > 0)
		return cfg.errorAgingThreshold;
	// C（轮数）：所有工具的成功结果（含 edit/write）共享统一阈值
	return cfg.agingThreshold;
}
