import { rmSync } from "node:fs";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a17fba20d673c5b8dd8551943369a2 as dehydrateRepo } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, deckFile, deleteRefs, diveRef, diveRefs, diverOf, featOf, packIgnored, quiet, readOnlyRefusals, wip } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27d7c72258e54d02070189892 as recordDive } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

export async function idae870d5677552668a3496e880920f3f(_args: Args, ctx: Ctx): Promise<void> {
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("pack works in a hero repo, and this is not one");
	const dive = diveOnDeck(hero, ctx);
	const me = diverOf(hero);
	const refused = readOnlyRefusals(dive);
	if (refused.length > 0) throw new Error(`read-only scopes hold work with nowhere to go, so nothing was packed:\n  ${refused.join("\n  ")}`);

	const id = String(dive.doc.fm.id);
	const own = diveRef(hero, id);
	const lines: string[] = [];
	for (const scope of dive.scopes.filter((each) => each.branch)) {
		if (runGit(scope.dir, "status", "--porcelain").text) {
			runGit(scope.dir, "add", "-A");
			const committed = runGit(scope.dir, "commit", "-q", "-m", wip(dive.doc));
			if (!committed.ok) throw new Error(`cannot commit ${scope.name}'s uncommitted work: ${committed.text}`);
		}
		const base = runGit(scope.dir, "rev-parse", "--verify", "-q", `refs/remotes/origin/${scope.branch}`).ok ? `refs/remotes/origin/${scope.branch}` : `refs/remotes/origin/${scope.trunk}`;
		const count = runGit(scope.dir, "rev-list", "--count", `${base}..HEAD`).text;
		const others = diveRefs(scope.dir, id).map(({ ref }) => ref).filter((ref) => ref !== own);
		if (count !== "0") {
			const pushed = runGit(scope.dir, "push", "-q", "--force", "origin", `HEAD:${own}`);
			if (!pushed.ok) throw new Error(`cannot push ${scope.name}'s work to ${own}: ${pushed.text}`);
			runGit(scope.dir, "update-ref", own, "HEAD");
			deleteRefs(scope.dir, others);
			lines.push(`- ${scope.name}: ${count} commit${count === "1" ? "" : "s"} kept on ${own} at ${runGit(scope.dir, "rev-parse", "--short", "HEAD").text}`);
		} else {
			deleteRefs(scope.dir, [own, ...others]);
			lines.push(`- ${scope.name}: no work`);
		}
	}

	// The work is safe on origin; a checkout that cannot be put away now is moved by the next jump.
	const featId = featOf(dive.doc);
	const stuck: string[] = [];
	for (const scope of dive.scopes) {
		const kept = packIgnored(hero, featId, scope);
		try {
			try {
				dehydrateRepo(hero, scope.repo, quiet(ctx));
			} catch (error) {
				if ((error as Error).name !== "DehydrateIgnored") throw error;
				dehydrateRepo(hero, scope.repo, quiet(ctx), { discard: true });
			}
			if (kept > 0) lines.push(`- ${scope.name}: ${kept} ignored file${kept === 1 ? "" : "s"} packed for the feat`);
		} catch (error) {
			stuck.push(`${scope.name}: ${(error as Error).message}`);
		}
	}
	recordDive(hero, dive.doc, { action: "pack", heading: "Packed", summary: `${me} put it down`, meta: { diver: null, packer: me }, lines: [`${me} put it down.`, "", ...lines] }, ctx);
	rmSync(deckFile(hero), { force: true });
	for (const line of stuck) ctx.err(`nosedive: left in place, ${line}`);
	ctx.out(`packed ${String(dive.doc.fm.name)}${lines.length > 0 ? `\n${lines.join("\n")}` : ""}`);
}
