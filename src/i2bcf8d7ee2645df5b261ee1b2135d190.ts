import { relative } from "node:path";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { coAuthor } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, deleteRefs, diveRefs, durableFeat, emailOf, featOf, fetchBase, heroBase, heroDoc, localBranch, metaOf, offBase, packIgnored, pushTrunk, readOnlyRefusals, scopesWith, stamp } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
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

	// Trunk, or the local branch a dive jumped --from is based on (jump-from-local-base).
	const base = heroBase(hero, metaOf(dive.doc).from);
	offBase(hero, base);
	const trunk = base.name;
	fetchBase(hero, base);
	const rebased = runGit(hero.dir, "rebase", "-q", base.ref);
	if (!rebased.ok) {
		runGit(hero.dir, "rebase", "--abort");
		throw new Error(`the hero's work conflicts with ${trunk}; its scopes landed, the hero did not: rebase it onto ${trunk}, then land ${id} again\n${rebased.text}`);
	}
	const heroWork = runGit(hero.dir, "rev-list", "--count", `${base.ref}..HEAD`).text;
	if (heroWork !== "0") {
		// A local base holds commits origin lacks that are not this dive's, its bookkeeping and the branch's own: only the hero's work is stamped.
		stamp(hero.dir, ["HEAD", "--not", ...(base.local ? [base.ref] : []), "--remotes=origin"], trailers);
		lines.push(`- hero: ${heroWork} commit${heroWork === "1" ? "" : "s"} onto ${trunk}`);
	}
	const cleared = new Map<string, string | undefined>([...dive.scopes.map((scope): [string, undefined] => [scope.repoId, undefined]), [hero.id!, undefined]]);
	pushTrunk(hero, () => {
		const doc = heroDoc(hero, id)!;
		recordDive(hero, doc, { action: "land", label: "landed", summary: `${me} landed it`, meta: { diver: null, outcome: "landed" }, scopes: scopesWith(hero, doc, cleared), lines: [`${me} landed it.`, "", ...lines] }, ctx.capes[0]!.version);
	}, base);

	const featId = featOf(dive.doc);
	deleteRefs(hero.dir, diveRefs(hero.dir, id).map(({ ref }) => ref));
	for (const scope of dive.scopes.filter((each) => each.ours)) {
		packIgnored(hero, featId, scope);
		deleteRefs(scope.dir, diveRefs(scope.dir, id).map(({ ref }) => ref));
		if (!scope.branch) continue;
		// Left where it landed, its branch gone: the work branch holds it now.
		runGit(scope.dir, "checkout", "-q", "--detach");
		runGit(scope.dir, "branch", "-q", "-D", localBranch(hero, id));
	}
	ctx.out(`landed ${String(dive.doc.fm.name)}${lines.length > 0 ? `\n${lines.join("\n")}` : ""}`);
}
