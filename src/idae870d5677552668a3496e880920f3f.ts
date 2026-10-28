import { rmSync } from "node:fs";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, deckFile, diverOf, readOnlyRefusals, refOf, wip } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27d7c72258e54d02070189892 as recordDive } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

export async function idae870d5677552668a3496e880920f3f(_args: Args, ctx: Ctx): Promise<void> {
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("pack works in a hero repo, and this is not one");
	const dive = diveOnDeck(hero, ctx);
	const me = diverOf(hero);
	const refused = readOnlyRefusals(dive);
	if (refused.length > 0) throw new Error(`read-only scopes hold work with nowhere to go, so nothing was packed:\n  ${refused.join("\n  ")}`);

	const ref = refOf(String(dive.doc.fm.id));
	const lines: string[] = [];
	for (const scope of dive.scopes.filter((each) => each.branch)) {
		if (runGit(scope.dir, "status", "--porcelain").text) {
			runGit(scope.dir, "add", "-A");
			const committed = runGit(scope.dir, "commit", "-q", "-m", wip(dive.doc));
			if (!committed.ok) throw new Error(`cannot commit ${scope.name}'s uncommitted work: ${committed.text}`);
		}
		const head = runGit(scope.dir, "rev-parse", "HEAD").text;
		if (head !== scope.pin) {
			const pushed = runGit(scope.dir, "push", "-q", "--force", "origin", `HEAD:${ref}`);
			if (!pushed.ok) throw new Error(`cannot push ${scope.name}'s work to ${ref}: ${pushed.text}`);
			const count = runGit(scope.dir, "rev-list", "--count", `${scope.pin}..HEAD`).text;
			lines.push(`- ${scope.name}: ${count} commit${count === "1" ? "" : "s"} past ${scope.pin.slice(0, 7)}, kept at ${head.slice(0, 7)}`);
		} else {
			if (runGit(scope.dir, "ls-remote", "--exit-code", "origin", ref).ok) runGit(scope.dir, "push", "-q", "origin", `:${ref}`);
			lines.push(`- ${scope.name}: no work`);
		}
	}
	for (const scope of dive.scopes) runGit(scope.dir, "checkout", "-q", "--detach", scope.pin);
	recordDive(hero, dive.doc, { action: "pack", heading: "Packed", summary: `${me} put it down`, meta: { diver: null, packer: me }, lines: [`${me} put it down.`, "", ...lines] }, ctx);
	rmSync(deckFile(hero), { force: true });
	ctx.out(`packed ${String(dive.doc.fm.name)}${lines.length > 0 ? `\n${lines.join("\n")}` : ""}`);
}
