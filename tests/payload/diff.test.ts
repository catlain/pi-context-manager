import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { doDiff } from "../../payload/diff.js";

// 用真实文件测试 doDiff（它内部调 readJsonFile 读文件）

const TMP = join(tmpdir(), "pi-payload-analyzer-test-diff");

beforeEach(() => {
	mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
	rmSync(TMP, { recursive: true, force: true });
});

function writePayload(filename: string, data: any) {
	writeFileSync(join(TMP, filename), JSON.stringify(data));
}

describe("doDiff", () => {
	it("文件不存在返回错误", () => {
		const result = doDiff("/nonexistent/1.json", "/nonexistent/2.json");
		expect(result).toContain("文件不存在");
	});

	it("相同 payload 显示共同前缀等于消息数", () => {
		const payload = {
			messages: [
				{ role: "system", content: "sys" },
				{ role: "user", content: "hello" },
			],
		};
		writePayload("a.json", payload);
		writePayload("b.json", payload);
		const result = doDiff(join(TMP, "a.json"), join(TMP, "b.json"));
		expect(result).toContain("共同前缀: 2");
	});

	it("不同 payload 显示差异", () => {
		writePayload("a.json", {
			messages: [
				{ role: "system", content: "sys" },
				{ role: "user", content: "hello" },
			],
		});
		writePayload("b.json", {
			messages: [
				{ role: "system", content: "sys" },
				{ role: "user", content: "world" },
			],
		});
		const result = doDiff(join(TMP, "a.json"), join(TMP, "b.json"));
		expect(result).toContain("共同前缀: 1");
		expect(result).toContain("不同:");
	});

	it("B 多了消息显示尾部", () => {
		writePayload("a.json", {
			messages: [{ role: "user", content: "hi" }],
		});
		writePayload("b.json", {
			messages: [
				{ role: "user", content: "hi" },
				{ role: "assistant", content: "hello" },
			],
		});
		const result = doDiff(join(TMP, "a.json"), join(TMP, "b.json"));
		expect(result).toContain("B 独有: 1");
	});
});
