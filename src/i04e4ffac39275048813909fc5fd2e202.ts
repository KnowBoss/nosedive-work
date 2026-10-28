import { rmSync } from "node:fs";
import { relative } from "node:path";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, deckFile, diverOf, readOnlyRefusals, refOf } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27d7c72258e54d02070189892 as recordDive } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

export async function i04e4ffac39275048813909fc5fd2e202(_args: Args, ctx: Ctx): Promise<void> {
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("land works in a hero repo, and this is not one");
	const dive = diveOnDeck(hero, ctx);
	const me = diverOf(hero);
	const id = String(dive.doc.fm.id);

	// Every refusal is found before anything is pushed.
	const refused = readOnlyRefusals(dive);
	for (const scope of dive.scopes.filter((each) => each.branch)) {
		const shown = relative(hero.dir, scope.dir).replace(/\\/g, "/");
		if (runGit(scope.dir, "status", "--porcelain").text) refused.push(`${shown} has uncommitted changes: commit them first`);
		if (runGit(scope.dir, "rev-parse", "HEAD").text === scope.pin) continue;
		runGit(scope.dir, "fetch", "-q", "origin");
		const published = runGit(scope.dir, "ls-remote", "origin", `refs/heads/${scope.branch}`).text.split("\t")[0];
		if (published && !runGit(scope.dir, "merge-base", "--is-ancestor", published, "HEAD").ok) {
			refused.push(`${scope.branch} in ${scope.name} has moved to ${published.slice(0, 7)}, which this dive's work does not contain: pack, then jump ${id}, which rebases the work onto it`);
		}
	}
	if (refused.length > 0) throw new Error(`nothing was landed:\n  ${refused.join("\n  ")}`);

	const lines: string[] = [];
	for (const scope of dive.scopes.filter((each) => each.branch)) {
		const head = runGit(scope.dir, "rev-parse", "HEAD").text;
		if (head === scope.pin) {
			lines.push(`- ${scope.name}: unchanged`);
			continue;
		}
		const pushed = runGit(scope.dir, "push", "-q", "origin", `HEAD:refs/heads/${scope.branch}`);
		if (!pushed.ok) throw new Error(`cannot push ${scope.name} to ${scope.branch}: ${pushed.text}`);
		lines.push(`- ${scope.name}: pushed ${head.slice(0, 7)} to ${scope.branch}`);
	}
	for (const scope of dive.scopes) {
		if (runGit(scope.dir, "ls-remote", "--exit-code", "origin", refOf(id)).ok) runGit(scope.dir, "push", "-q", "origin", `:${refOf(id)}`);
	}
	recordDive(hero, dive.doc, { action: "land", heading: "Landed", summary: `${me} landed it`, meta: { diver: null, outcome: "landed" }, lines: [`${me} landed it.`, "", ...lines] }, ctx);
	rmSync(deckFile(hero), { force: true });
	ctx.out(`landed ${String(dive.doc.fm.name)}${lines.length > 0 ? `\n${lines.join("\n")}` : ""}`);
}
