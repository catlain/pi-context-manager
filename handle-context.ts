/** handle-context.ts — context 事件处理逻辑（纯操作，从 index.ts 闭包获取状态引用） */
import {
	buildToolCallMap,
	estimateTokens,
	isPlansFilePath,
	isSkillFilePath,
	removeOrphanedToolCalls,
	toolMeta,
} from "./distill-helpers.js";
import {
	fillTemplate,
	getContextConfig,
	hintsConfig,
	loadManifest,
	saveManifest,
	writeCachedMessages,
} from "./shared.js";
import { truncateToolCallArgs } from "./toolcall-args-truncator.js";

export interface ContextState {
	agingTracker: Map<string, number>;
	agingSnapshot: Map<string, number>;
	manuallyDeletedIds: Set<string>;
	agingDeletedIds: Set<string>;
	seenArgs: Set<string>;
	truncatedToolCallIds: Set<string>;
	lastMessages: PayloadMessage[];
	sessionId: string;
}

export function handleContextEvent(
	event: { messages: PayloadMessage[] },
	_ctx: unknown,
	state: ContextState,
	pi: ExtensionAPI,
) {
	const {
		agingTracker,
		agingSnapshot,
		manuallyDeletedIds,
		agingDeletedIds,
		seenArgs,
		truncatedToolCallIds,
	} = state;

	// 设置 sessionId 并加载对应的 manifest
	// resume 冷启动后扩展重新加载，state.sessionId=""。
	// 第一次 context 事件时 getSessionId() 可能返回 undefined（扩展加载早期），
	// 此时用 PI_SESSION_ID 环境变量作为 fallback，确保 manifest 正确恢复。
	// 否则 agingDeletedIds 为空 → 被删除的大结果全部恢复进上下文 → 爆炸。
	const sid = _ctx?.sessionManager?.getSessionId?.() || process.env.PI_SESSION_ID || "";
	if (sid && sid !== state.sessionId) {
		state.sessionId = sid;
		loadManifest(sid, {
			manuallyDeleted: manuallyDeletedIds,
			agingDeleted: agingDeletedIds,
			agingTracker,
		});
	}

	const messages = event.messages as any[];
	const toolCallMap = buildToolCallMap(messages);
	const { distillThreshold, agingThreshold, errorAgingThreshold, largeResultAging, firstSeenCap } = getContextConfig();
	// 有效 cap：不低于 distillThreshold，避免架空 distill 机制
	const effectiveCap = Math.max(firstSeenCap, distillThreshold);

	// ── warmup ──
	if (seenArgs.size === 0) {
		let toolResultCount = 0;
		for (const msg of messages) {
			if (msg.role === "toolResult") toolResultCount++;
		}
		if (toolResultCount > 10) {
			for (const msg of messages) {
				if (msg.role === "toolResult" && msg.toolCallId) {
					seenArgs.add(msg.toolCallId);
				}
			}
		}
	}

	const toRemove: number[] = [];

	// ── 统一遍历：distill（大结果阈值=2）+ aging（通用阈值=N）──
	const activeTcIds = new Set<string>();
	const removedTcIds = new Set<string>();

	for (let i = 0; i < messages.length; i++) {
		const msg = messages[i];
		if (msg.role !== "toolResult") continue;
		const tcId = msg.toolCallId || "";
		if (!tcId) continue;

		// 已被永久删除（之前轮次达到阈值）
		if (agingDeletedIds.has(tcId)) {
			toRemove.push(i);
			removedTcIds.add(tcId);
			continue;
		}

		const toolName = msg.toolName || "unknown";
		const textParts = (Array.isArray(msg.content) ? msg.content : []).filter(
			(p: PayloadContentBlock) => p.type === "text",
		);
		const origText = textParts
			.map((p: PayloadContentBlock) => p.text ?? "")
			.join("");
		const origTokens = estimateTokens(origText);

		// 计算该 tcId 的实际阈值（优先级：大结果 > 错误结果 > 普通结果）
		const isError = !!(msg as any).isError;
		const effectiveThreshold =
			origTokens >= distillThreshold && largeResultAging > 0 ? largeResultAging
			: isError && errorAgingThreshold > 0 ? errorAgingThreshold
			: agingThreshold;
		if (effectiveThreshold <= 0) continue; // aging 关闭时跳过普通结果

		// 技能文件 / plans 目录豁免：read 调用这些路径时永不 aging
		const callInfo = toolCallMap.get(tcId);
		const filePath = callInfo?.arguments?.path;
		if (toolName === "read" && (isSkillFilePath(filePath) || isPlansFilePath(filePath)))
			continue;

		activeTcIds.add(tcId);
		const prevCount = agingTracker.get(tcId) || 0;
		const count = prevCount + 1;
		agingTracker.set(tcId, count);

		if (count >= effectiveThreshold) {
			// 达到阈值 → 静默删除（distill 和 aging 统一行为）
			toRemove.push(i);
			removedTcIds.add(tcId);
		} else if (origTokens >= distillThreshold && count === 1) {
			// 大结果首次出现
			if (firstSeenCap !== 0 && origTokens > effectiveCap) {
				// 超大结果（> cap）→ 首次也直接删除
				toRemove.push(i);
				removedTcIds.add(tcId);
				if (!seenArgs.has(tcId)) {
					seenArgs.add(tcId);
					const meta = toolMeta(msg, toolCallMap);
					const label = meta.meta || toolName;
					pi.events.emit("ephemeral:hint", {
						text: fillTemplate(hintsConfig.distillOverCapWarning, {
							label,
							tokens: String(origTokens),
							cap: String(effectiveCap),
						}),
						short: fillTemplate(hintsConfig.distillOverCapWarningShort, {
							label,
						}),
					});
				}
			} else if (!seenArgs.has(tcId)) {
				// 正常首次（≤ cap）→ 保留全文，提示 AI 用精确方法获取信息
				seenArgs.add(tcId);
				const meta = toolMeta(msg, toolCallMap);
				const label = meta.meta || toolName;
				pi.events.emit("ephemeral:hint", {
					text: fillTemplate(hintsConfig.distillWarning, {
						label,
						tokens: String(origTokens),
					}),
					short: fillTemplate(hintsConfig.distillWarningShort, { label }),
				});
			}
		}
	}

	// cleanup：移除达到阈值的 tcId，加入永久删除集合
	if (removedTcIds.size > 0) {
		for (const tcId of removedTcIds) {
			agingTracker.delete(tcId);
			agingDeletedIds.add(tcId);
		}
	}

	for (const tcId of agingTracker.keys()) {
		if (!activeTcIds.has(tcId)) agingTracker.delete(tcId);
	}
	// 每轮保存 manifest（含 agingCounts），确保 reload 后恢复计数
	saveManifest(state.sessionId, {
		manuallyDeleted: manuallyDeletedIds,
		agingDeleted: agingDeletedIds,
		agingCounts: agingTracker,
	});

	// 更新 aging 快照
	agingSnapshot.clear();
	for (const [k, v] of agingTracker) agingSnapshot.set(k, v);

	// ── 第三遍：手动删除 ──
	const manualRemoveIds = new Set<string>();
	if (manuallyDeletedIds.size > 0) {
		for (let i = 0; i < messages.length; i++) {
			const msg = messages[i];
			if (msg.role !== "toolResult") continue;
			const tcId = msg.toolCallId || "";
			if (tcId && manuallyDeletedIds.has(tcId)) {
				toRemove.push(i);
				manualRemoveIds.add(tcId);
			}
		}
		for (const id of manuallyDeletedIds) {
			if (!manualRemoveIds.has(id)) manuallyDeletedIds.delete(id);
		}
	}

	// 反向删除 + 清理孤立 toolCall block
	if (toRemove.length > 0) {
		// 必须降序排列，确保 splice 不影响后续 index
		toRemove.sort((a, b) => b - a);
		for (const idx of toRemove) {
			messages.splice(idx, 1);
		}
		removeOrphanedToolCalls(messages);
	}

	// ── 截断 toolCall.arguments ──
	const { processorThreshold } = getContextConfig();
	if (processorThreshold > 0) {
		truncateToolCallArgs(messages, processorThreshold, truncatedToolCallIds);
	}

	// 保存最终 messages
	state.lastMessages = messages;
	writeCachedMessages(messages);
}
