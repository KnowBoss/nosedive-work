import { relative } from "node:path";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { coAuthor } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, deleteRefs, diveRefs, durableFeat, emailOf, featOf, fetchUpstream, heroDoc, homeUpstream, packIgnored, pushRecord, readOnlyRefusals, scopesWith, stamp, syncHome } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27d7c72258e54d02070189892 as recordDive } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

export async function i2bcf8d7ee2645df5b261ee1b2135d190(args: Args, ctx: Ctx): Promise<void> {
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("land works in a hero repo, and this is not one");
	const dive = diveOnDeck(hero, ctx, typeof args.dive === "string" ? args.dive : undefined);
	const me = emailOf(hero);
	const id = String(dive.doc.fm.id);
	const writable = dive.scopes.filter((scope) => scope.branch && scope.ours);

	// Every refusal is found before anything is pushed.
	const refused = readOnlyRefusals(dive);
	if (runGit(hero.dir, "status", "--porcelain").text) refused.push("the hero has uncommitted changes: commit them first");
	// The hero's work goes home, the branch the dive was jumped from, which must be its upstream's (records-on-jumped-branch).
	const { home } = dive;
	const up = homeUpstream(hero, home);
	fetchUpstream(hero, up);
	try {
		syncHome(hero, home, up);
	} catch (error) {
		refused.push((error as Error).message);
	}
	const published = new Map<string, string>();
	for (const scope of writable) {
		const shown = relative(hero.dir, scope.dir).replace(/\\/g, "/");
		if (runGit(scope.dir, "status", "--porcelain").text) refused.push(`${shown} has uncommitted changes: commit them first`);
		const tip = runGit(scope.dir, "ls-remote", "origin", `refs/heads/${scope.branch}`).text.split("\t")[0];
		if (tip) published.set(scope.name, tip);
		if (tip && !runGit(scope.dir, "merge-base", "--is-ancestor", tip, "HEAD").ok) {
			runGit(scope.dir, "fetch", "-q", "origin");
			refused.push(`${scope.branch} in ${scope.name} has moved to ${tip.slice(0, 7)}, which this dive's work does not contain: pack, then jump ${id}, which rebases the work onto it`);
		}
	}
	if (refused.length > 0) throw new Error(`nothing was landed:\n  ${refused.join("\n  ")}`);

	const trailers = [`Nosedive-Dive: ${id}`, `Nosedive-Feat: ${durableFeat(hero, dive.doc, ctx.capes)}`, coAuthor(ctx.capes[0]!.version)];
	const lines: string[] = [];
	for (const scope of writable) {
		const base = published.get(scope.name) ?? `refs/remotes/origin/${scope.trunk}`;
		if (runGit(scope.dir, "rev-list", "--count", `${base}..HEAD`).text === "0") {
			lines.push(`- ${scope.name}: unchanged`);
			continue;
		}
		stamp(scope.dir, ["HEAD", "--not", "--remotes=origin"], trailers);
		const head = runGit(scope.dir, "rev-parse", "HEAD").text;
		const pushed = runGit(scope.dir, "push", "-q", "origin", `HEAD:refs/heads/${scope.branch}`);
		if (!pushed.ok) throw new Error(`cannot push ${scope.name} to ${scope.branch}: ${pushed.text}`);
		runGit(scope.dir, "update-ref", `refs/remotes/origin/${scope.branch}`, head);
		lines.push(`- ${scope.name}: pushed ${head.slice(0, 7)} to ${scope.branch}`);
	}

	const rebased = runGit(hero.dir, "rebase", "-q", `refs/heads/${home}`);
	if (!rebased.ok) {
		runGit(hero.dir, "rebase", "--abort");
		throw new Error(`the hero's work conflicts with ${home}; its scopes landed, the hero did not: rebase ${dive.branch} onto ${home}, then land ${id} again\n${rebased.text}`);
	}
	const heroWork = runGit(hero.dir, "rev-list", "--count", `refs/heads/${home}..HEAD`).text;
	if (heroWork !== "0") {
		stamp(hero.dir, ["HEAD", "--not", `refs/heads/${home}`, "--remotes=origin"], trailers);
		lines.push(`- hero: ${heroWork} commit${heroWork === "1" ? "" : "s"} onto ${home}`);
	}
	// Home, its work on it between the jump record and the land record, the dive branch gone (loop-returns-home).
	const tip = runGit(hero.dir, "rev-parse", "HEAD").text;
	runGit(hero.dir, "checkout", "-q", home);
	runGit(hero.dir, "merge", "-q", "--ff-only", tip);
	runGit(hero.dir, "branch", "-q", "-D", dive.branch);
	const cleared = new Map<string, string | undefined>([...dive.scopes.map((scope): [string, undefined] => [scope.repoId, undefined]), [hero.id!, undefined]]);
	pushRecord(hero, () => {
		const doc = heroDoc(hero, id)!;
		recordDive(hero, doc, { action: "land", label: "landed", summary: `${me} landed it`, meta: { diver: null, outcome: "landed" }, scopes: scopesWith(hero, doc, cleared), lines: [`${me} landed it.`, "", ...lines] }, ctx.capes[0]!.version);
	});

	const featId = featOf(dive.doc);
	deleteRefs(hero.dir, diveRefs(hero.dir, id).map(({ ref }) => ref));
	for (const scope of dive.scopes.filter((each) => each.ours)) {
		packIgnored(hero, featId, scope);
		deleteRefs(scope.dir, diveRefs(scope.dir, id).map(({ ref }) => ref));
		if (!scope.branch) continue;
		// Left where it landed, its branch gone: the work branch holds it now.
		runGit(scope.dir, "checkout", "-q", "--detach");
		runGit(scope.dir, "branch", "-q", "-D", dive.branch);
	}
	ctx.out(`landed ${String(dive.doc.fm.name)}${lines.length > 0 ? `\n${lines.join("\n")}` : ""}`);
}
