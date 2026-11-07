import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { MigrationCtx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { diveBranch, tokenOf } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

const SLASHED = /^nosedive\/([0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function i01a1b3d8387a7abf826280910ae9fdbb(dir: string, ctx: MigrationCtx): string[] {
	const hero = findBridge(dir);
	if (!hero || hero.dir !== dir) return [];
	const branches = (at: string) => runGit(at, "for-each-ref", "--format=%(refname:short)", "refs/heads/").text.split("\n").filter(Boolean);
	// Only this checkout's dives: a scope's cache may hold another hero's, still on a work that reads the old name.
	const tokens = new Set(branches(dir).filter((branch) => !SLASHED.test(branch)).map((branch) => tokenOf(hero, branch)));
	const checkouts = hero.workspace && existsSync(hero.workspace) ? readdirSync(hero.workspace).map((name) => join(hero.workspace!, name)).filter((at) => existsSync(join(at, ".git"))) : [];
	let renamed = 0;
	for (const at of [dir, ...checkouts]) {
		for (const branch of branches(at)) {
			const [, token, diveId] = SLASHED.exec(branch) ?? [];
			if (!token || !diveId || !tokens.has(token)) continue;
			const moved = runGit(at, "branch", "-m", branch, diveBranch(token, diveId));
			if (!moved.ok) throw new Error(`cannot rename ${branch} in ${at}: ${moved.text}`);
			renamed += 1;
		}
	}
	if (renamed > 0) ctx.out(`dive-branch-dashes: renamed ${renamed} dive branch${renamed === 1 ? "" : "es"} to nosedive-<token>-<dive id>`);
	return [];
}
