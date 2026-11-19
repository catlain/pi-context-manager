/**
 * 工具结果后处理器入口
 *
 * 注册 tool_result handler，委托核心逻辑到 tool-result-processor-core。
 */

import type {
	ExtensionAPI,
	ExtensionContext,
	ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { getContextConfig, resolveSessionId } from "./shared.js";
import {
	type ProcessorOptions,
	processToolResult,
} from "./tool-result-processor-core.js";

const _DEFAULT_THRESHOLD = 4000;

/**
 * 注册 tool_result handler。
 *
 * @param pi - ExtensionAPI 实例
 * @param options - 可选配置覆盖（主要用于测试）
 */
export function registerToolResultProcessor(
	pi: ExtensionAPI,
	options?: ProcessorOptions,
): void {
	// 每次调用时从 settings 读阈值（支持 /processor-config 热更新）
	const writeFallback = options?.writeFallback ?? false;

	pi.on(
		"tool_result",
		((event: ToolResultEvent, ctx: ExtensionContext) => {
			try {
				const threshold =
					options?.distillThreshold ?? getContextConfig().processorThreshold;
				if (threshold <= 0) return undefined; // 0 = 禁用
				// sid 单源解析（含 PI_SESSION_ID 兜底，修：空 ctx 时原文误落 anon 致定向清理遗漏）
				const sessionId = resolveSessionId(ctx);
				const result = processToolResult(
					event,
					threshold,
					writeFallback,
					sessionId,
				);

				return result;
			} catch {
				return undefined;
			}
		}) as never,
	);
}
