/**
 * aging 集成测试共享 mock 基座（内联箭头惰性调用模式）
 *
 * 用法（测试文件内）：
 *   import { agingMockState, sharedMockFactory, mkState, mkMsg, rem } from "./aging-test-helpers.js";
 *   vi.mock("../shared.js", () => sharedMockFactory());            // ← 必须内联箭头包裹惰性调用
 *   vi.mock("../distill-helpers.js", () => distillHelpersMock());   //   直接传标识符会在提升时 TDZ
 *   beforeEach(() => { agingMockState.config = {...}; agingMockState.tokensFn = ...; });
 *
 * 原理：vi.mock 调用被提升到文件顶，但工厂体惰性执行（被 mock 模块首次被请求时）——
 * 此时本 helper 模块已完整加载，普通模块级 const 状态即可。工厂内以属性访问惰性读
 * agingMockState，beforeEach 对 config/tokensFn/hints 的修改对工厂生效。
 */
import { vi } from "vitest";
import type { ContextState } from "../handle-context.js";

// ── 可变 mock 状态（工厂惰性读；无需 vi.hoisted——工厂体运行期才执行，
//    此时本模块已完整加载；且 hoisted 变量禁止跨文件 export） ──
export const agingMockState = {
	/** getContextConfig() 返回值（beforeEach 覆写） */
	config: {
		distillThreshold: 1000,
		agingThreshold: 3,
		errorAgingThreshold: 3,
		largeResultAging: 2,
		processorThreshold: 0,
		firstSeenCap: 15000,
	} as Record<string, number>,
	/** estimateTokens 行为（beforeEach 覆写，如 () => 500 固定值） */
	tokensFn: (t: string) => Math.ceil(t.length / 4) as number,
	/** hintsConfig（beforeEach 可覆写个别键/文案） */
	hints: {
		distillWarning: "📋 「{label}」~{tokens} tokens，下轮移除。",
		distillWarningShort: "📋 「{label}」下轮移除",
		distillOverCapWarning: "⚠️ 「{label}」~{tokens} > {cap}，已直接移除。",
		distillOverCapWarningShort: "⚠️ 「{label}」已移除",
		agingWarning: "[aging] {label} 轮数={count}",
		agingWarningShort: "[aging] {label}",
		processorSummary: "[processed] {toolName}",
		processorSmallResult: "{formatted}",
	} as Record<string, string>,
};

// ── Mock 工厂（测试文件 vi.mock(path, factory) 直接引用） ──

/** shared.js 统一 mock：config/hints 惰性读 agingMockState */
export const sharedMockFactory = () => ({
	getContextConfig: () => agingMockState.config,
	distilledMap: new Map(),
	readCachedMessages: () => [],
	writeCachedMessages: vi.fn(),
	saveManifest: vi.fn(),
	loadManifest: vi.fn(),
	hintsConfig: agingMockState.hints,
	fillTemplate: (t: string, v: Record<string, string>) =>
		t.replace(/\{(\w+)\}/g, (_: string, k: string) => v[k] ?? `{${k}}`),
});

/**
 * distill-helpers.js 统一 mock：保真实生产逻辑（路径豁免判断 / selectAgingThreshold
 * 优先级 / removeOrphanedToolCalls），只 override estimateTokens。
 * ——替代历史上各文件手写复刻 selectAgingThreshold 优先级的全量 mock（I7 消除复刻，
 * 生产逻辑变更时测试自动跟随，不再出现"测试验证旧行为却全绿"的假绿）。
 * 用法：vi.mock("../distill-helpers.js", (o) => distillHelpersMockFactory(o))
 * （必须内联箭头透传 importOriginal——直接传标识符会在提升时 TDZ；工厂返回对象/Promise）
 */
export const distillHelpersMockFactory = async (
	importOriginal: () => Promise<typeof import("../distill-helpers.js")>,
) => ({
	...(await importOriginal()),
	estimateTokens: (t: string) => agingMockState.tokensFn(t),
});

/** pi SDK mock（registerXxx 空壳） */
export const piSdkMockFactory = () => ({
	registerExtension: vi.fn(),
	registerCommand: vi.fn(),
	registerTool: vi.fn(),
});

/** toolcall-args-truncator mock */
export const truncatorMockFactory = () => ({
	truncateToolCallArgs: vi.fn(),
});

// ── 纯 helper（无 mock 语义，直接导入使用） ──

export const mkState = (): ContextState => ({
	agingTracker: new Map(),
	agingSnapshot: new Map(),
	manuallyDeletedIds: new Set(),
	agingDeletedIds: new Set(),
	seenArgs: new Set(),
	truncatedToolCallIds: new Set(),
	lastMessages: [],
	sessionId: "",
});

export const mkPi = () => ({ events: { emit: vi.fn() } });

/** 构造 toolCall + toolResult 消息对（opts.isError 可选） */
export const mkMsg = (
	tcId: string,
	toolName: string,
	args: Record<string, unknown>,
	text: string,
	opts: { isError?: boolean } = {},
): any[] => [
	{
		role: "assistant",
		content: [
			{ type: "toolCall", id: tcId, name: toolName, arguments: args },
		],
	},
	{
		role: "toolResult",
		toolCallId: tcId,
		toolName,
		content: [{ type: "text", text }],
		isError: opts.isError ?? false,
	},
];

/** 提取剩余 toolResult 的 tcId 列表 */
export const rem = (msgs: any[]) =>
	msgs.filter((m: any) => m.role === "toolResult").map((m: any) => m.toolCallId);
