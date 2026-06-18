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

/** OpenAI provider 格式的工具调用（assistant 消息的 tool_calls 字段） */
export interface ProviderToolCall {
	id?: string;
	/** OpenAI 格式下 arguments 是 JSON 字符串 */
	function?: { name?: string; arguments?: string };
	[key: string]: unknown;
}

/** Provider payload 中的消息（同时覆盖 pi 内部格式与 OpenAI provider 格式） */
export interface PayloadMessage {
	role:
		| "system"
		| "developer"
		| "user"
		| "assistant"
		| "toolResult"
		| "tool"
		| string;
	content?: string | PayloadContentBlock[];
	// pi 内部格式（toolResult）
	toolName?: string;
	toolCallId?: string;
	// OpenAI provider 格式（tool result / assistant tool_calls）
	tool_call_id?: string;
	tool_calls?: ProviderToolCall[];
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
