import path from "node:path";
import { defineConfig } from "vitest/config";

const globalNodeModules =
	"/home/lain/.local/share/fnm/node-versions/v22.22.2/installation/lib/node_modules";
const piAgentModules = "/home/lain/.pi/agent/npm/node_modules";

export default defineConfig({
	resolve: {
		alias: {
			"@earendil-works/pi-coding-agent": path.resolve(
				globalNodeModules,
				"@earendil-works/pi-coding-agent/dist/index.js",
			),
			typebox: path.resolve(piAgentModules, "@sinclair/typebox/build/cjs/index.js"),
		},
	},
	test: {
		include: ["**/*.test.ts", "tests/**/*.test.ts"],
		environment: "node",
		testTimeout: 10000,
	},
});
