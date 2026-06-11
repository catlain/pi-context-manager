/** 命令注册：/record、/distill-config、/processor-config、/context-clean */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { cleanContextData, listSessionData } from "./clean.js";
import { cleanRecordings, isRecording, setRecording } from "./recording.js";
import { getContextConfig, setContextConfig } from "./shared.js";

export function registerRecordCommand(pi: ExtensionAPI) {
	pi.registerCommand("record", {
		description: "Toggle provider payload recording (on/off).",
		handler: async (_args, ctx) => {
			const arg = _args?.trim()?.toLowerCase() ?? "";
			if (arg === "help" || arg === "-h") {
				ctx.ui.notify(
					`[record] 切换 provider payload 录制\n\n用法:\n  /record        # 切换开关\n  /record on     # 开启录制\n  /record off    # 关闭录制`,
					"info",
				);
				return;
			}
			let on: boolean;
			if (arg === "on") on = setRecording(true);
			else if (arg === "off") on = setRecording(false);
			else on = setRecording(!isRecording());
			if (on) {
				const cleaned = cleanRecordings();
				const extra = cleaned > 0 ? `（已清理 ${cleaned} 个旧文件）` : "";
				ctx.ui.notify(`⏺ Payload 录制已开启${extra}`, "info");
			} else {
				ctx.ui.notify("⏹ Payload 录制已关闭", "info");
			}
		},
	});
}

export function registerContextCleanCommand(pi: ExtensionAPI) {
	pi.registerCommand("context-clean", {
		description:
			"清理 context 扩展持久化数据。/context-clean [sessionId] — 指定会话ID只清理该会话；不传参清理全部。",
		handler: async (args, ctx) => {
			const sid = args?.trim() ?? "";
			if (sid === "help" || sid === "-h") {
				ctx.ui.notify(
					`[context-clean] 清理 context 持久化数据\n\n用法:\n  /context-clean            # 清理全部会话数据\n  /context-clean <sessionId> # 只清理指定会话`,
					"info",
				);
				return;
			}
			if (sid) {
				const { cleaned, freedMB } = cleanContextData(sid);
				if (cleaned > 0) {
					ctx.ui.notify(
						`🧹 已清理会话 ${sid} 的数据（释放 ${freedMB} MB）`,
						"info",
					);
				} else {
					ctx.ui.notify(`会话 ${sid} 无数据可清理`, "info");
				}
			} else {
				const sessions = listSessionData();
				if (sessions.length === 0) {
					ctx.ui.notify("无持久化数据可清理", "info");
					return;
				}
				const totalMB = sessions.reduce((s, x) => s + x.sizeMB, 0);
				cleanContextData();
				ctx.ui.notify(
					`🧹 已清理全部 ${sessions.length} 个会话数据（释放 ${Math.round(totalMB * 100) / 100} MB）`,
					"info",
				);
			}
		},
	});
}

export function registerDistillConfigCommand(pi: ExtensionAPI) {
	pi.registerCommand("distill-config", {
		description:
			"View or set distill config. Usage: /distill-config | /distill-config 1500 | /distill-config --cap 20000",
		handler: async (args, ctx) => {
			const arg = args?.trim() ?? "";
			if (!arg) {
				const cfg = getContextConfig();
				ctx.ui.notify(
					`[distill-config]\n  distillThreshold = ${cfg.distillThreshold} tokens\n  firstSeenCap = ${cfg.firstSeenCap} tokens（0 = 不设上限）\n\n用法:\n  /distill-config 1500         # 设置 distill 阈值\n  /distill-config --cap 20000  # 设置首次全文上限\n  /distill-config --cap 0      # 禁用首次全文上限`,
					"info",
				);
				return;
			}
			// --cap 子命令
			const capMatch = arg.match(/^--cap\s+(\d+)$/);
			if (capMatch) {
				const val = Number(capMatch[1]);
				const updated = setContextConfig({ firstSeenCap: val });
				ctx.ui.notify(
					`✅ firstSeenCap = ${updated.firstSeenCap}${updated.firstSeenCap === 0 ? "（不设上限）" : " tokens"}`,
					"info",
				);
				return;
			}
			// 设置 distillThreshold
			const val = Number(arg);
			if (Number.isNaN(val) || val <= 0) {
				ctx.ui.notify(`❌ 无效值: ${arg}（需要正整数）`, "error");
				return;
			}
			const updated = setContextConfig({ distillThreshold: val });
			ctx.ui.notify(
				`✅ distillThreshold = ${updated.distillThreshold}`,
				"info",
			);
		},
	});
}

export function registerAgingConfigCommand(pi: ExtensionAPI) {
	const USAGE = `[aging-config]
用法:
  /aging-config                                    # 查看当前配置
  /aging-config 10                                 # 设置普通结果 aging 轮数
  /aging-config off                                # 禁用 aging
  /aging-config error 3                            # 设置错误结果 aging 轮数（0 = 禁用加速）
  /aging-config large 2                            # 设置大结果 aging 轮数（0 = 禁用加速）`;

	const parseSet = (arg: string): { key: keyof ContextConfig; val: number } | null => {
		const parts = arg.split(/\s+/);
		if (parts.length === 2) {
			const [subCmd, numStr] = parts;
			const val = Number(numStr);
			if (Number.isNaN(val) || val < 0 || !Number.isInteger(val)) return null;
			if (subCmd === "error") return { key: "errorAgingThreshold", val };
			if (subCmd === "large") return { key: "largeResultAging", val };
			return null;
		}
		if (parts.length === 1 && parts[0]) {
			if (parts[0] === "off") return { key: "agingThreshold", val: 0 };
			const val = Number(parts[0]);
			if (Number.isNaN(val) || val < 0 || !Number.isInteger(val)) return null;
			return { key: "agingThreshold", val };
		}
		return null;
	};

	const LABELS: Record<string, string> = {
		errorAgingThreshold: "错误结果 aging",
		largeResultAging: "大结果 aging",
		agingThreshold: "普通结果 aging",
	};

	const notify = (ctx: any, msg: string, type: string) => ctx.ui.notify(msg, type as any);

	const STATE_SUFFIX: Record<string, string> = {
		errorAgingThreshold: "（错误加速淘汰禁用）",
		largeResultAging: "（大结果加速淘汰禁用）",
		agingThreshold: "（aging 禁用）",
	};

	const registerCommand = (pi: any) => {
		pi.registerCommand("aging-config", {
			description: "View or set aging config. Usage: /aging-config | /aging-config 10 | /aging-config error 3 | /aging-config large 2 | /aging-config off",
			handler: async (args: string, ctx: any) => {
				const arg = args?.trim() ?? "";
				const cfg = getContextConfig();
				if (!arg) {
					notify(ctx,
						`[aging-config]
  agingThreshold = ${cfg.agingThreshold} 次请求（0 = 禁用）
  errorAgingThreshold = ${cfg.errorAgingThreshold} 次请求（错误结果，0 = 禁用加速）
  largeResultAging = ${cfg.largeResultAging} 次请求（大结果，0 = 禁用加速）

用法:
  /aging-config 10          # 设置普通结果 aging 轮数
  /aging-config error 3     # 设置错误结果 aging 轮数
  /aging-config large 2     # 设置大结果 aging 轮数
  /aging-config off         # 禁用 aging`,
						"info");
					return;
				}
				const parsed = parseSet(arg);
				if (!parsed) {
					notify(ctx, `❌ 无效参数: ${arg}\n${USAGE}`, "error");
					return;
				}
				const updated = setContextConfig({ [parsed.key]: parsed.val } as Partial<ContextConfig>);
				const label = LABELS[parsed.key] ?? parsed.key;
				const suffix = parsed.val === 0 ? (STATE_SUFFIX[parsed.key] ?? "") : "";
				notify(ctx, `✅ ${label} = ${parsed.val} 次请求${suffix}`, "info");
			},
		});
	};
	registerCommand(pi);
}

export function registerProcessorConfigCommand(pi: ExtensionAPI) {
	pi.registerCommand("processor-config", {
		description:
			"View or set tool-result-processor token threshold. Usage: /processor-config | /processor-config 2000",
		handler: async (args, ctx) => {
			const arg = args?.trim() ?? "";
			const cfg = getContextConfig();
			if (!arg) {
				ctx.ui.notify(
					`[processor-config]\n  processorThreshold = ${cfg.processorThreshold} tokens\n\n用法:\n  /processor-config 2000  # 设置 processor 阈值\n  /processor-config off   # 禁用 processor`,
					"info",
				);
				return;
			}
			if (arg === "off" || arg === "0") {
				const _updated = setContextConfig({ processorThreshold: 0 });
				ctx.ui.notify(`✅ processorThreshold = 0（后处理器禁用）`, "info");
				return;
			}
			const val = Number(arg);
			if (Number.isNaN(val) || val <= 0) {
				ctx.ui.notify(`❌ 无效值: ${arg}（需要正整数或 off）`, "error");
				return;
			}
			const updated = setContextConfig({ processorThreshold: val });
			ctx.ui.notify(
				`✅ processorThreshold = ${updated.processorThreshold}`,
				"info",
			);
		},
	});
}
