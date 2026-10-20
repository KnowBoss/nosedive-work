import { spawnSync } from "node:child_process";

export function i01a15bb27f1471549b097c2e37805132(cwd: string, ...args: string[]): { ok: boolean; text: string } {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	return { ok: result.status === 0, text: (result.status === 0 ? result.stdout : result.stderr || result.stdout || result.error?.message || "").trim() };
}
