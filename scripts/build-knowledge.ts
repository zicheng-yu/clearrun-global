/**
 * Builds src/shared/knowledge.gen.ts from knowledge/*.yaml.
 *   node scripts/build-knowledge.ts          write the module
 *   node scripts/build-knowledge.ts --check  fail if it is stale (CI)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KnowledgeError, readKnowledge, renderKnowledge } from "./knowledge-lib.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "src/shared/knowledge.gen.ts");

try {
	const knowledge = readKnowledge(join(root, "knowledge"));
	const text = renderKnowledge(knowledge);
	const summary = `${knowledge.cases.length} cases, ${knowledge.rules.length} rules, ${knowledge.calendar.length} calendar events`;
	if (process.argv.includes("--check")) {
		const current = (() => {
			try {
				return readFileSync(target, "utf8");
			} catch {
				return "";
			}
		})();
		if (current !== text) {
			console.error("src/shared/knowledge.gen.ts is out of date: run `npm run knowledge`.");
			process.exit(1);
		}
		console.log(`knowledge up to date (${summary})`);
	} else {
		writeFileSync(target, text);
		console.log(`wrote src/shared/knowledge.gen.ts (${summary})`);
	}
} catch (error) {
	if (error instanceof KnowledgeError) {
		console.error(error.message);
		process.exit(1);
	}
	throw error;
}
