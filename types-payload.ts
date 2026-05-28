/**
 * pi SDK Provider Payload 类型定义
 *
 * pi 的 provider payload 是发送给 LLM 的请求体。
 * 这里的类型覆盖了 collect.ts 中实际使用的字段子集。
 */

/** Provider payload 中的 content block */
export interface PayloadContentBlock {
	type: "text" | "image" | "toolCall" | string;
	text?: string;
	// toolCall 字段
	id?: string;
	name?: string;
	arguments?: Record<string, unknown>;
	[key: string]: unknown;
}

/** Provider payload 中的消息 */
export interface PayloadMessage {
	role: "system" | "developer" | "user" | "assistant" | "toolResult" | string;
	content?: string | PayloadContentBlock[];
	// toolResult 字段
	toolName?: string;
	toolCallId?: string;
	[key: string]: unknown;
}

/** Provider payload 顶层结构 */
export interface ProviderPayload {
	system?: string | PayloadContentBlock[];
	instructions?: string;
	messages?: PayloadMessage[];
	tools?: ToolDefinition[];
	[key: string]: unknown;
}

/** 工具定义（精简版） */
export interface ToolDefinition {
	name?: string;
	function?: { name?: string };
	[key: string]: unknown;
}

/** Context usage 返回结构 */
export interface ContextUsage {
	tokens: number;
	contextWindow: number;
	percent: number;
}
