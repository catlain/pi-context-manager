/** clean.ts — context 持久化数据清理工具 */

import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { DISTILL_DIR } from "./shared.js";

const RECORDINGS_DIR = join(DISTILL_DIR, "recordings");
const PROCESSOR_DIR = join(DISTILL_DIR, "processor");

/** 已知的非会话目录名（会话清理/列举时排除） */
const NON_SESSION_DIRS = new Set(["processor", "recordings"]);

/** 计算目录大小（字节） */
function dirSizeBytes(dir: string): number {
	let total = 0;
	try {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) total += dirSizeBytes(full);
			else if (entry.isFile()) total += statSync(full).size;
		}
	} catch {
		/* ignore */
	}
	return total;
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

/** 判断目录名是否像会话 id（≥8 字符且非已知功能目录） */
function isSessionLike(name: string): boolean {
	if (NON_SESSION_DIRS.has(name)) return false;
	return name.length >= 8;
}

/** 列出 DISTILL_DIR 顶层的会话目录及其大小（不含 recordings/processor 功能目录） */
export function listSessionData(): { sessionId: string; sizeMB: number }[] {
	if (!existsSync(DISTILL_DIR)) return [];
	return readdirSync(DISTILL_DIR, { withFileTypes: true })
		.filter((d) => d.isDirectory() && isSessionLike(d.name))
		.map((d) => ({
			sessionId: d.name,
			sizeMB: dirSizeBytes(join(DISTILL_DIR, d.name)) / 1024 / 1024,
		}));
}

/** 收集所有已知会话 id（来自 DISTILL_DIR 顶层、recordings/、processor/ 子目录） */
export function collectAllSessionIds(): string[] {
	const ids = new Set<string>();
	const collectFrom = (base: string) => {
		if (!existsSync(base)) return;
		for (const d of readdirSync(base, { withFileTypes: true })) {
			if (d.isDirectory() && d.name.length >= 8) ids.add(d.name);
		}
	};
	if (existsSync(DISTILL_DIR)) {
		for (const d of readdirSync(DISTILL_DIR, { withFileTypes: true })) {
			if (d.isDirectory() && isSessionLike(d.name)) ids.add(d.name);
		}
	}
	collectFrom(RECORDINGS_DIR);
	collectFrom(PROCESSOR_DIR);
	return [...ids];
}

/**
 * 短 id 后缀归一化：返回所有以 shortId 结尾的完整会话 id。
 * - 长度 1：唯一匹配，可直接清理
 * - 长度 >1：多义，调用方应提示用户补全
 * - 长度 0：无匹配
 */
export function resolveSessionId(shortId: string): string[] {
	const trimmed = shortId.trim();
	if (!trimmed) return [];
	return collectAllSessionIds().filter((id) => id.endsWith(trimmed));
}

export interface CleanResult {
	cleaned: number;
	freedMB: number;
	status: "cleaned" | "not_found" | "ambiguous";
	/** ambiguous: 多个候选完整 id；not_found: 全部已存在会话 id（供辅助提示） */
	candidates: string[];
}

/**
 * 清理指定会话或全部的 context 数据。
 *
 * 单会话模式（传 sessionId）：
 * - 接受完整 UUID 或短 id 后缀，归一化后清理 recordings/<sid>/、<sid>/、processor/<sid>/ 三处
 * - 不触碰全局缓存 last-*.json（运行时状态）
 * - 多义/未找到时返回相应状态，由命令层展示
 *
 * 全量模式（不传参）：清理全部会话 + recordings + processor + 全局缓存
 */
export function cleanContextData(sessionIdInput?: string): CleanResult {
	if (sessionIdInput) {
		const sid = sessionIdInput.trim();
		const matches = resolveSessionId(sid);
		if (matches.length > 1) {
			return {
				cleaned: 0,
				freedMB: 0,
				status: "ambiguous",
				candidates: matches,
			};
		}
		const target = matches[0] ?? sid;
		const targets = [
			join(RECORDINGS_DIR, target),
			join(DISTILL_DIR, target),
			join(PROCESSOR_DIR, target),
		];
		let freed = 0;
		let cleaned = 0;
		for (const dir of targets) {
			if (existsSync(dir)) {
				freed += dirSizeBytes(dir) / 1024 / 1024;
				rmSync(dir, { recursive: true, force: true });
				cleaned++;
			}
		}
		if (cleaned === 0) {
			return {
				cleaned: 0,
				freedMB: 0,
				status: "not_found",
				candidates: collectAllSessionIds(),
			};
		}
		return {
			cleaned,
			freedMB: round2(freed),
			status: "cleaned",
			candidates: [],
		};
	}

	// 全量清理
	if (!existsSync(DISTILL_DIR)) {
		return { cleaned: 0, freedMB: 0, status: "cleaned", candidates: [] };
	}
	const sessions = listSessionData();
	let totalBytes = 0;
	for (const s of sessions) {
		const dir = join(DISTILL_DIR, s.sessionId);
		totalBytes += dirSizeBytes(dir);
		rmSync(dir, { recursive: true, force: true });
	}
	for (const funcDir of [RECORDINGS_DIR, PROCESSOR_DIR]) {
		if (existsSync(funcDir)) {
			totalBytes += dirSizeBytes(funcDir);
			rmSync(funcDir, { recursive: true, force: true });
		}
	}
	for (const f of ["last-messages.json", "last-payload.json"]) {
		const p = join(DISTILL_DIR, f);
		if (existsSync(p)) {
			totalBytes += statSync(p).size;
			rmSync(p);
		}
	}
	return {
		cleaned: sessions.length,
		freedMB: round2(totalBytes / 1024 / 1024),
		status: "cleaned",
		candidates: [],
	};
}

/**
 * 迁移：删除 processor/ 根目录下的散落文件（旧格式 writeRaw/toolcall 产物），
 * 保留子目录（新结构 processor/<sid>/）。在扩展加载时调用一次，幂等。
 * @returns 删除的散落文件数
 */
export function migrateLegacyProcessorFiles(): number {
	if (!existsSync(PROCESSOR_DIR)) return 0;
	let removed = 0;
	for (const entry of readdirSync(PROCESSOR_DIR, { withFileTypes: true })) {
		if (entry.isFile()) {
			rmSync(join(PROCESSOR_DIR, entry.name));
			removed++;
		}
		// 子目录（processor/<sid>/ 新结构）保留不动
	}
	return removed;
}
