import { rmSync } from "node:fs";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, deckFile, diverOf, refOf } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27d7c72258e54d02070189892 as recordDive } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

export async function ifa8cd225959e58129b06dc2cc5a5b837(args: Args, ctx: Ctx): Promise<void> {
	const reason = String(args.why ?? "").trim();
	if (!reason) throw new Error("bail needs a reason: --reason <why>");
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("bail works in a hero repo, and this is not one");
	const dive = diveOnDeck(hero, ctx);
	const me = diverOf(hero);
	const ref = refOf(String(dive.doc.fm.id));

	const lines = [`${me} bailed: ${reason}`, ""];
	for (const scope of dive.scopes) {
		const commits = runGit(scope.dir, "log", "--reverse", "--format=%h %s", `${scope.pin}..HEAD`).text;
		const dirty = runGit(scope.dir, "status", "--porcelain").text !== "";
		lines.push(`- ${scope.name}: ${commits ? `held ${commits.split("\n").join("; ")}` : "held no commits"}${dirty ? "; its uncommitted changes were dropped" : ""}`);
		if (runGit(scope.dir, "ls-remote", "--exit-code", "origin", ref).ok) runGit(scope.dir, "push", "-q", "origin", `:${ref}`);
		runGit(scope.dir, "checkout", "-q", "--force", "--detach", scope.pin);
	}
	recordDive(hero, dive.doc, { action: "bail", heading: "Bailed", summary: reason, meta: { diver: null, outcome: "bailed" }, lines }, ctx);
	rmSync(deckFile(hero), { force: true });
	ctx.out(`bailed ${String(dive.doc.fm.name)}`);
}
