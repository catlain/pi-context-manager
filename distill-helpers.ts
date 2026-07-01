import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/** 估算 token 数（字符数 / 4，向上取整） */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

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

// ── 技能文件豁免 ──

const AGENT_DIR =
	process.env.PI_AGENT_DIR || join(process.env.HOME || "/root", ".pi", "agent");

/** 判断路径是否属于技能文件（内联技能或 npm 技能） */
export function isSkillFilePath(path: string | undefined): boolean {
	if (!path) return false;
	const resolved =
		path.startsWith("/") || path.startsWith("C:")
			? path
			: join(AGENT_DIR, path);
	if (!resolved.startsWith(AGENT_DIR)) return false;
	// 匹配 skills/{name}/ 或 node_modules/{pkg}/skills/{name}/
	return /[\\/]skills[\\/][^\\/]+[\\/]/.test(resolved);
}

/** 判断路径是否属于项目 plans 目录（.pi/plans/）— 路线图计划文档永不 aging */
export function isPlansFilePath(path: string | undefined): boolean {
	if (!path) return false;
	// 匹配 .pi/plans/ 路径（项目级计划文档）— 支持相对路径和绝对路径
	return /(^|[\\/])\.pi[\\/]plans[\\/]/.test(path);
}

/** 判断路径是否属于 openspec 变更文档（openspec/changes/）— 变更文档永不 aging
 *  仅匹配 changes 目录（当前活跃变更），不含 specs 目录（已归档能力规格不豁免）。 */
export function isOpenspecChangePath(path: string | undefined): boolean {
	if (!path) return false;
	// 匹配 openspec/changes/ 路径段 — 支持相对路径和绝对路径、兼容 / 与 \ 分隔符
	return /(^|[\\/])openspec[\\/]changes[\\/]/.test(path);
}

// ── aging 策略选择（纯函数，便于独立测试） ──

/** aging 决策上下文：一个 toolResult 的关键字段 */
export interface AgingContext {
	toolName: string;
	isError: boolean;
	tokens: number;
	filePath?: string;
}

/** 判断是否完全跳过 aging（不累加计数、不进 firstSeenCap）。
 *  现有规则：read 命中 skill / plans / openspec 变更文档路径。
 *  注意：edit/write 不在此豁免——它们走 selectAgingThreshold 的 Infinity 阈值，
 *  以便仍能经过 firstSeenCap 检查。 */
export function isAgingExempt(ctx: AgingContext): boolean {
	if (
		ctx.toolName === "read" &&
		(isSkillFilePath(ctx.filePath) ||
			isPlansFilePath(ctx.filePath) ||
			isOpenspecChangePath(ctx.filePath))
	)
		return true;
	return false;
}

/** aging 策略所需配置字段的精简接口（selectAgingThreshold 只读这 4 个字段） */
export interface AgingConfig {
	distillThreshold: number;
	agingThreshold: number;
	errorAgingThreshold: number;
	largeResultAging: number;
}

/** 选择有效 aging 阈值（轮数）。返回 Infinity 表示永不达龄。
 *  优先级：edit/write 非错误（豁免 A+C）> 大文件（A，保持原有 A>B 优先）> 错误结果（B）> 普通轮数（C）。
 *  返回 ≤0 表示该策略被禁用（配置关闭）。
 *  注意：edit/write 的错误结果不给予豁免——如果是大文件走 A，否则走 B，与原行为一致。 */
export function selectAgingThreshold(
	ctx: AgingContext,
	cfg: AgingConfig,
): number {
	// edit/write 非错误：豁免 A（大文件）和 C（轮数），用 Infinity 表示永不达龄，
	// 但仍会经过主循环的 firstSeenCap 检查（见 handle-context.ts）。
	// 必须在 A 之前拦截，否则会被大文件优先级抢走。
	if (
		(ctx.toolName === "edit" || ctx.toolName === "write") &&
		!ctx.isError
	)
		return Number.POSITIVE_INFINITY;
	// A（大文件）：对所有工具（含 edit/write 错误的大文件）生效，保持原有 A>B 优先级
	if (ctx.tokens >= cfg.distillThreshold && cfg.largeResultAging > 0)
		return cfg.largeResultAging;
	// B（出错）：非大文件的错误结果走加速淘汰
	if (ctx.isError && cfg.errorAgingThreshold > 0)
		return cfg.errorAgingThreshold;
	// C（轮数）
	return cfg.agingThreshold;
}
