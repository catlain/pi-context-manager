/** shared.ts — 配置、常量、持久化工具函数。不持有运行时可变状态。 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import { join } from "node:path";
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
export const MSG_CACHE = join(DISTILL_DIR, "last-messages.json");
export const PAYLOAD_CACHE = join(DISTILL_DIR, "last-payload.json");

/** 缓存文件按会话定位：非空 sid → distill/<sid>/<name>；空 sid → distill/anon/<name>（沿 ADR-010，不落根目录） */
export function getCachePath(sessionId: string, name: string) {
	return join(DISTILL_DIR, sessionId || "anon", name);
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
		const p = getCachePath(sessionId, "last-messages.json");
		if (existsSync(p)) {
			const data = JSON.parse(safeReadFileSync(p));
			if (Array.isArray(data)) return data;
		}
	} catch {
		/* ignore */
	}
	return [];
}

/** 写入 context messages 到文件缓存（按会话隔离） */
export function writeCachedMessages(
	sessionId: string,
	msgs: PayloadMessage[],
) {
	try {
		const p = getCachePath(sessionId, "last-messages.json");
		mkdirSync(join(p, ".."), { recursive: true });
		writeFileSync(p, JSON.stringify(msgs));
	} catch (err) {
		console.warn("[context] writeCachedMessages failed:", err);
	}
}

/** 读取最后一次 provider payload（文件缓存，按会话隔离） */
export function readCachedPayload(
	sessionId: string,
): Record<string, unknown> | null {
	try {
		const p = getCachePath(sessionId, "last-payload.json");
		if (existsSync(p)) return JSON.parse(safeReadFileSync(p));
	} catch {
		/* ignore */
	}
	return null;
}

// ── Manifest 持久化（按会话隔离） ──
function getManifestPath(sessionId: string) {
	const dir = join(DISTILL_DIR, sessionId || "anon");
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

// 启动时恢复 distilledMap（无 sessionId，用 anon/ 路径）；根目录孤儿 manifest 先迁移至 anon/（仿 migrateLegacyProcessorFiles）
try {
	const legacyGlobalManifest = join(DISTILL_DIR, "manifest.json");
	const anonManifest = join(DISTILL_DIR, "anon", "manifest.json");
	if (existsSync(legacyGlobalManifest) && !existsSync(anonManifest)) {
		mkdirSync(join(DISTILL_DIR, "anon"), { recursive: true });
		renameSync(legacyGlobalManifest, anonManifest);
	}
	if (existsSync(anonManifest)) {
		const data: ManifestData = JSON.parse(safeReadFileSync(anonManifest));
		for (const [k, v] of data.distilled || []) distilledMap.set(k, v);
	}
} catch {
	/* ignore */
}
