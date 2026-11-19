/** shared.ts — 配置、常量、持久化工具函数。不持有运行时可变状态。 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import type { PayloadMessage } from "./types-payload.js";

/** 持久化根目录：重启不丢失，用于 manifest、录制、缓存 */
export const DISTILL_DIR = join(
	os.homedir(),
	".pi/agent/distill",
);

// ── Hints 模板配置 ──
export interface HintsConfig {
	distillWarning: string;
	distillWarningShort: string;
	distillOverCapWarning: string;
	distillOverCapWarningShort: string;
	processorSummary: string;
	processorSmallResult: string;
}

const DEFAULT_HINTS: HintsConfig = {
	distillWarning:
		"📋 [auto-distill] 「{label}」全文 ~{tokens} tokens，超过上下文阈值。请使用 read(offset,limit)/grep 等精确方法获取所需信息，下轮请求时此结果会被自动移除。",
	distillWarningShort: "📋 大结果「{label}」下轮自动移除",
	distillOverCapWarning:
		"⚠️ [auto-distill] 「{label}」~{tokens} tokens 超过安全上限（{cap} tokens），已直接移除。请用 read(offset,limit) 分段获取所需信息。",
	distillOverCapWarningShort: "⚠️ 超大结果「{label}」已自动移除",
	processorSummary:
		"[processed] {toolName} 结果（~{tokens} tokens）\n完整内容：{tmpPath}\n\n{preview}\n{more}",
	processorSmallResult: "{formatted}\n\n原文：{tmpPath}",
};

const USER_HINTS_PATH = join(
	os.homedir(),
	".pi/agent/extensions/context/hints.json",
);

function loadHintsConfig(): HintsConfig {
	try {
		if (existsSync(USER_HINTS_PATH)) {
			const userHints = JSON.parse(readFileSync(USER_HINTS_PATH, "utf-8"));
			return { ...DEFAULT_HINTS, ...userHints };
		}
	} catch {
		/* ignore */
	}
	return { ...DEFAULT_HINTS };
}

export const hintsConfig = loadHintsConfig();

/** 替换模板占位符 */
export function fillTemplate(
	template: string,
	vars: Record<string, string>,
): string {
	return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}
// ── 缓存文件名常量（clean.ts 扫尾与各读写共用；旧全局导出 PAYLOAD_CACHE/MSG_CACHE 已删，生产零引用） ──
export const LAST_PAYLOAD_NAME = "last-payload.json";
export const LAST_MESSAGES_NAME = "last-messages.json";
export const ANON_DIR_NAME = "anon";

/** sessionId 统一解析（单源，修 C1）：explicit（调用方显式指定，如用户传参分析目标）→ ctx.sessionManager → PI_SESSION_ID → ""（空值由落点统一折 anon） */
export function resolveSessionId(
	ctx?: { sessionManager?: { getSessionId?: () => string | undefined } },
	explicit?: string,
): string {
	return (
		explicit ||
		ctx?.sessionManager?.getSessionId?.() ||
		process.env.PI_SESSION_ID ||
		""
	);
}

/** 缓存文件按会话定位：非空 sid → distill/<sid>/<name>；空 sid → distill/anon/<name>（沿 ADR-010，不落根目录） */
export function getCachePath(sessionId: string, name: string) {
	return join(DISTILL_DIR, sessionId || ANON_DIR_NAME, name);
}

/** 写缓存文件（内含目录创建）—— mkdir 收敛单点，调用侧不再关心建目录 */
export function writeCacheFile(
	sessionId: string,
	name: string,
	data: unknown,
) {
	const p = getCachePath(sessionId, name);
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(p, JSON.stringify(data));
}

export interface DistillEntry {
	toolName: string;
	meta: string;
	tokens: number;
	distilledAt: number;
}

export const distilledMap = new Map<string, DistillEntry>();

import {
	getSettingsSection,
	patchSettingsSection,
} from "@pi-atelier/shared-utils";

// ── 配置（持久化到 settings.json → context） ──
export interface ContextConfig {
	distillThreshold: number;
	agingThreshold: number;
	/** 错误结果（isError=true）的 aging 轮数。默认 3。设 0 禁用错误加速淘汰。 */
	errorAgingThreshold: number;
	/** 大结果（token ≥ distillThreshold）的 aging 轮数。默认 2。 */
	largeResultAging: number;
	processorThreshold: number;
	/** 首次给全文的 token 上限。超大结果首次也直接删除。默认 15000。设 0 禁用首次保留。 */
	firstSeenCap: number;
}

const DEFAULT_CONFIG: ContextConfig = {
	distillThreshold: 5000,
	agingThreshold: 10,
	errorAgingThreshold: 3,
	largeResultAging: 2,
	processorThreshold: 500,
	firstSeenCap: 15000,
};

export const getContextConfig = (): ContextConfig =>
	getSettingsSection<ContextConfig>("context", DEFAULT_CONFIG);

export const setContextConfig = (
	patch: Partial<ContextConfig>,
): ContextConfig =>
	patchSettingsSection<ContextConfig>("context", patch, DEFAULT_CONFIG);

// ── 文件缓存读写 ──
function safeReadFileSync(p: string) {
	try {
		return readFileSync(p, "utf-8");
	} catch {
		return "";
	}
}

/** 读取最后一次 context messages（文件缓存，按会话隔离） */
export function readCachedMessages(sessionId: string): PayloadMessage[] {
	try {
		const p = getCachePath(sessionId, LAST_MESSAGES_NAME);
		if (existsSync(p)) {
			const data = JSON.parse(safeReadFileSync(p));
			if (Array.isArray(data)) return data;
		}
	} catch {
		/* ignore */
	}
	return [];
}

/** 写入 context messages 到文件缓存（按会话隔离；mkdir 收敛于 writeCacheFile） */
export function writeCachedMessages(
	sessionId: string,
	msgs: PayloadMessage[],
) {
	try {
		writeCacheFile(sessionId, LAST_MESSAGES_NAME, msgs);
	} catch (err) {
		console.warn("[context] writeCachedMessages failed:", err);
	}
}

/** 读取最后一次 provider payload（文件缓存，按会话隔离） */
export function readCachedPayload(
	sessionId: string,
): Record<string, unknown> | null {
	try {
		const p = getCachePath(sessionId, LAST_PAYLOAD_NAME);
		if (existsSync(p)) return JSON.parse(safeReadFileSync(p));
	} catch {
		/* ignore */
	}
	return null;
}

// ── Manifest 持久化（按会话隔离） ──
function getManifestPath(sessionId: string) {
	const dir = join(DISTILL_DIR, sessionId || ANON_DIR_NAME);
	mkdirSync(dir, { recursive: true });
	return join(dir, "manifest.json");
}

interface ManifestData {
	distilled: [string, DistillEntry][];
	manuallyDeleted: string[];
	agingDeleted: string[];
	agingCounts: [string, number][];
}

export function saveManifest(
	sessionId: string,
	opts: {
		manuallyDeleted: Iterable<string>;
		agingDeleted: Iterable<string>;
		agingCounts?: Iterable<[string, number]>;
	},
) {
	try {
		const data: ManifestData = {
			distilled: [...distilledMap],
			manuallyDeleted: [...opts.manuallyDeleted],
			agingDeleted: [...opts.agingDeleted],
			agingCounts: opts.agingCounts ? [...opts.agingCounts] : [],
		};
		writeFileSync(getManifestPath(sessionId), JSON.stringify(data));
	} catch (err) {
		console.warn("[context] saveManifest failed:", err);
	}
}

export function loadManifest(
	sessionId: string,
	opts: {
		manuallyDeleted: Set<string>;
		agingDeleted: Set<string>;
		agingTracker?: Map<string, number>;
	},
) {
	try {
		const p = getManifestPath(sessionId);
		if (!existsSync(p)) return;
		const data: ManifestData = JSON.parse(safeReadFileSync(p));
		if (data.distilled) distilledMap.clear();
		for (const [k, v] of data.distilled || []) distilledMap.set(k, v);
		opts.manuallyDeleted.clear();
		for (const id of data.manuallyDeleted || []) opts.manuallyDeleted.add(id);
		opts.agingDeleted.clear();
		for (const id of data.agingDeleted || []) opts.agingDeleted.add(id);
		if (opts.agingTracker) {
			opts.agingTracker.clear();
			for (const [k, v] of data.agingCounts || []) opts.agingTracker.set(k, v);
		}
	} catch {
		/* ignore */
	}
}

/**
 * 启动期遗留数据迁移与恢复（幂等，失败静默）—— 由 index.ts 扩展初始化时显式调用（与 migrateLegacyProcessorFiles 同等待遇）：
 * - 根目录孤儿 manifest.json → anon/manifest.json
 * - recordings/unknown/（v0.3.2 前空会话哨兵目录，<8 字符清理盲区）→ recordings/anon/
 * - anon manifest 的 distilled 灌入 distilledMap
 */
export function initLegacyManifest(baseDir: string = DISTILL_DIR) {
	try {
		const anonDir = join(baseDir, ANON_DIR_NAME);
		const legacyGlobalManifest = join(baseDir, "manifest.json");
		const anonManifest = join(anonDir, "manifest.json");
		if (existsSync(legacyGlobalManifest) && !existsSync(anonManifest)) {
			mkdirSync(anonDir, { recursive: true });
			renameSync(legacyGlobalManifest, anonManifest);
		}
		if (existsSync(anonManifest)) {
			const data: ManifestData = JSON.parse(safeReadFileSync(anonManifest));
			for (const [k, v] of data.distilled || []) distilledMap.set(k, v);
		}
		const recordingsRoot = join(baseDir, "recordings");
		const legacyUnknown = join(recordingsRoot, "unknown");
		const anonRecordings = join(recordingsRoot, ANON_DIR_NAME);
		if (existsSync(legacyUnknown) && !existsSync(anonRecordings)) {
			renameSync(legacyUnknown, anonRecordings);
		}
	} catch {
		/* ignore */
	}
}
