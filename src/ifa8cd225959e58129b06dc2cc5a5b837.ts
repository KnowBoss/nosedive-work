import { rmSync } from "node:fs";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, deckFile, deleteRefs, diveRefs, diverOf, featOf, localBranch, orphan, packIgnored } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27d7c72258e54d02070189892 as recordDive } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

export async function ifa8cd225959e58129b06dc2cc5a5b837(args: Args, ctx: Ctx): Promise<void> {
	const reason = String(args.why ?? "").trim();
	if (!reason) throw new Error("bail needs a reason: --reason <why>");
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("bail works in a hero repo, and this is not one");
	const dive = diveOnDeck(hero, ctx);
	const me = diverOf(hero);
	const id = String(dive.doc.fm.id);
	const featId = featOf(dive.doc);

	const lines = [`${me} bailed: ${reason}`, ""];
	for (const scope of dive.scopes) {
		packIgnored(hero, featId, scope);
		const dirty = runGit(scope.dir, "status", "--porcelain").text !== "";
		// The dive's refs go, so what only they held is orphaned first.
		const refs = diveRefs(scope.dir, id).map(({ ref }) => ref);
		for (const ref of refs) runGit(scope.dir, "update-ref", "-d", ref);
		const kept = orphan(hero, scope.dir);
		lines.push(`- ${scope.name}: ${kept ? `held ${kept.commits.reverse().join("; ")}, kept on ${kept.ref}` : "held no commits"}${dirty ? "; its uncommitted changes were dropped" : ""}`);
		const meets = scope.branch && runGit(scope.dir, "rev-parse", "--verify", "-q", `refs/remotes/origin/${scope.branch}`).ok ? `refs/remotes/origin/${scope.branch}` : `refs/remotes/origin/${scope.trunk}`;
		const base = runGit(scope.dir, "merge-base", "HEAD", meets).text || meets;
		runGit(scope.dir, "checkout", "-q", "--force", "--detach", base);
		runGit(scope.dir, "clean", "-q", "-f", "-d");
		if (scope.branch) runGit(scope.dir, "branch", "-q", "-D", localBranch(hero, id));
		deleteRefs(scope.dir, refs);
	}
	recordDive(hero, dive.doc, { action: "bail", heading: "Bailed", summary: reason, meta: { diver: null, outcome: "bailed" }, lines }, ctx);
	rmSync(deckFile(hero), { force: true });
	ctx.out(`bailed ${String(dive.doc.fm.name)}`);
}
