/** 命令注册：/record、/distill-config、/processor-config */
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { setRecording, isRecording, cleanRecordings, getContextConfig, setContextConfig } from "./shared.js";

export function registerRecordCommand(pi: ExtensionAPI) {
	pi.registerCommand("record", {
		description: "Toggle provider payload recording (on/off).",
		handler: async (_args, ctx) => {
			const arg = _args?.trim()?.toLowerCase() ?? "";
			let on: boolean;
			if (arg === "on") on = setRecording(true);
			else if (arg === "off") on = setRecording(false);
			else on = setRecording(!isRecording());
			if (on) {
				const cleaned = cleanRecordings();
				const extra = cleaned > 0 ? `（已清理 ${cleaned} 个旧文件）` : "";
				ctx.ui.notify(`⏺ Payload 录制已开启${extra}，文件写入 /tmp/pi-distill/recordings`, "info");
			} else {
				ctx.ui.notify("⏹ Payload 录制已关闭", "info");
			}
		},
	});
}

export function registerDistillConfigCommand(pi: ExtensionAPI) {
	pi.registerCommand("distill-config", {
		description: "View or set auto-distill token threshold. Usage: /distill-config | /distill-config 1500",
		handler: async (args, ctx) => {
			const arg = args?.trim() ?? "";
			if (!arg) {
				const cfg = getContextConfig();
				ctx.ui.notify(`[distill-config] distillThreshold = ${cfg.distillThreshold} tokens`, "info");
				return;
			}
			const val = Number(arg);
			if (isNaN(val) || val <= 0) {
				ctx.ui.notify(`❌ 无效值: ${arg}（需要正整数）`, "error");
				return;
			}
			const updated = setContextConfig({ distillThreshold: val });
			ctx.ui.notify(`✅ distillThreshold = ${updated.distillThreshold}`, "info");
		},
	});
}

export function registerAgingConfigCommand(pi: ExtensionAPI) {
	pi.registerCommand("aging-config", {
		description: "View or set aging threshold (rounds before removal). Usage: /aging-config | /aging-config 10 | /aging-config off",
		handler: async (args, ctx) => {
			const arg = args?.trim() ?? "";
			const cfg = getContextConfig();
			if (!arg) {
				ctx.ui.notify(`[aging-config] agingThreshold = ${cfg.agingThreshold} 次请求（0 = 禁用）`, "info");
				return;
			}
			if (arg === "off") {
				const updated = setContextConfig({ agingThreshold: 0 });
				ctx.ui.notify(`✅ agingThreshold = 0（aging 禁用）`, "info");
				return;
			}
			const val = Number(arg);
			if (isNaN(val) || val < 0 || !Number.isInteger(val)) {
				ctx.ui.notify(`❌ 无效值: ${arg}（需要非负整数或 off）`, "error");
				return;
			}
			const updated = setContextConfig({ agingThreshold: val });
			ctx.ui.notify(`✅ agingThreshold = ${updated.agingThreshold} 次请求${updated.agingThreshold === 0 ? "（禁用）" : ""}`, "info");
		},
	});
}

export function registerProcessorConfigCommand(pi: ExtensionAPI) {
	pi.registerCommand("processor-config", {
		description: "View or set tool-result-processor token threshold. Usage: /processor-config | /processor-config 2000",
		handler: async (args, ctx) => {
			const arg = args?.trim() ?? "";
			const cfg = getContextConfig();
			if (!arg) {
				ctx.ui.notify(`[processor-config] processorThreshold = ${cfg.processorThreshold} tokens`, "info");
				return;
			}
			if (arg === "off" || arg === "0") {
				const updated = setContextConfig({ processorThreshold: 0 });
				ctx.ui.notify(`✅ processorThreshold = 0（后处理器禁用）`, "info");
				return;
			}
			const val = Number(arg);
			if (isNaN(val) || val <= 0) {
				ctx.ui.notify(`❌ 无效值: ${arg}（需要正整数或 off）`, "error");
				return;
			}
			const updated = setContextConfig({ processorThreshold: val });
			ctx.ui.notify(`✅ processorThreshold = ${updated.processorThreshold}`, "info");
		},
	});
}
