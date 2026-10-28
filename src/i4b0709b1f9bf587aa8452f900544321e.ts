import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a141f869c07c4da8288927a559c8ae as mintKbDoc } from "nosedive-core";
import { i01a1335480c776ba8945020d0af333eb as mintUuid } from "nosedive-core";
import { i01a15baf13e27bd88dc880d4871f2210 as hydrateRepo } from "nosedive-core";
import { i01a13c760de87562b4738946402010b8 as checkoutPath } from "nosedive-core";
import { i01a1335483aa776cb84df698b04adc06 as writeKbDoc } from "nosedive-core";
import { deckFile, diverOf, featOf, featRoot, heroDoc, keyOf, localBranch, onDeckId, orphan, quiet, readScopes, repoDoc, swapIgnored, trunkOf, wip, type ScopeEntry } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27d7c72258e54d02070189892 as recordDive, type Doc, type Hero } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

type Planned = ScopeEntry & { repo: Doc; name: string; dir: string; shown: string; local?: string; settled: boolean };

export async function i4b0709b1f9bf587aa8452f900544321e(args: Args, ctx: Ctx): Promise<void> {
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("jump works in a hero repo, and this is not one: `nosedive seed` makes one");
	const ref = String(args.ref);
	const target = heroDoc(hero, ref);
	if (!target) throw new Error(`no doc ${ref} in the hero`);
	const onDeck = onDeckId(hero);
	const me = diverOf(hero);
	const also: string[] = [];
	let diveId = ref;
	if (target.fm.kind !== "dive") {
		const at = featRoot(hero, ref);
		if (!at) throw new Error(`${String(target.fm.name)} is no feat: nothing reaches it from a root of the hero through a .feat link; link it from a feat first`);
		if (onDeck) throw new Error(`dive ${onDeck} is on deck: pack, bail or land it first`);
		diveId = mintDive(hero, at, target);
		also.push(target.path);
	}
	if (onDeck && onDeck !== diveId) throw new Error(`dive ${onDeck} is on deck: pack, bail or land it first`);

	const dive = heroDoc(hero, diveId);
	if (dive?.fm.kind !== "dive") throw new Error(`${diveId} is no dive in the hero`);
	const meta = (dive.fm.meta ?? {}) as { diver?: unknown; outcome?: unknown };
	if (meta.outcome) throw new Error(`dive ${String(dive.fm.name)} is over: it ${String(meta.outcome)}`);
	if (typeof meta.diver === "string" && meta.diver !== me) throw new Error(`dive ${String(dive.fm.name)} is held by ${meta.diver}`);
	const featId = featOf(dive);

	// A checkout already where the dive wants it is the diver's to change; any other must lose nothing by moving.
	const plan = readScopes(dive).map((entry): Planned => {
		const repo = repoDoc(hero, entry.repoId);
		const name = String(repo.fm.name);
		const dir = checkoutPath(hero, name);
		const local = entry.branch ? localBranch(hero, diveId) : undefined;
		const on = existsSync(dir) ? runGit(dir, "symbolic-ref", "-q", "--short", "HEAD") : undefined;
		const settled = local ? on?.text === local : on !== undefined && !on.ok && onDeck === diveId;
		return { ...entry, repo, name, dir, shown: relative(hero.dir, dir).replace(/\\/g, "/"), local, settled };
	});
	const refused = plan.filter((scope) => existsSync(scope.dir) && !scope.settled && runGit(scope.dir, "status", "--porcelain").text).map((scope) => `${scope.shown} has uncommitted changes or untracked files`);
	if (refused.length > 0) throw new Error(`jump would lose work, so nothing moved:\n  ${refused.join("\n  ")}`);

	const lines: string[] = [];
	for (const scope of plan) {
		let moved = false;
		const notes: string[] = [];
		if (!existsSync(scope.dir)) {
			hydrateRepo(hero, scope.repo, quiet(ctx), scope.local ? { id: diveId, workBranch: scope.branch! } : undefined);
			moved = true;
		} else {
			runGit(scope.dir, "fetch", "-q", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*", "+refs/nosedive/*:refs/nosedive/*");
			if (!scope.settled) {
				const kept = orphan(hero, scope.dir);
				if (kept) notes.push(`its ${kept.commits.length} commit${kept.commits.length === 1 ? "" : "s"} origin lacked kept on ${kept.ref}`);
				const trunk = trunkOf(scope.repo, scope.dir);
				if (scope.local) switchTo(scope.dir, scope.local, scope.branch!, trunk);
				else runGit(scope.dir, "checkout", "-q", "--detach", `refs/remotes/origin/${trunk}`);
				moved = true;
			}
		}
		if (scope.local && !runGit(scope.dir, "status", "--porcelain").text) {
			// The dive's work may have been packed from another hero, or rebased there.
			const packed = runGit(scope.dir, "for-each-ref", "--sort=-committerdate", "--format=%(refname)", "refs/nosedive/dives").text.split("\n").find((each) => each.endsWith(`/${diveId}`));
			if (packed && !runGit(scope.dir, "merge-base", "--is-ancestor", packed, "HEAD").ok) {
				if (!runGit(scope.dir, "merge-base", "--is-ancestor", "HEAD", packed).ok) {
					const kept = orphan(hero, scope.dir);
					if (kept) notes.push(`its local commits kept on ${kept.ref}`);
				}
				runGit(scope.dir, "reset", "-q", "--hard", packed);
			}
			const branch = `refs/remotes/origin/${scope.branch}`;
			if (runGit(scope.dir, "rev-parse", "--verify", "-q", branch).ok && !runGit(scope.dir, "merge-base", "--is-ancestor", branch, "HEAD").ok) {
				mkdirSync(dirname(deckFile(hero)), { recursive: true });
				writeFileSync(deckFile(hero), `${diveId}\n`);
				const rebased = runGit(scope.dir, "rebase", "-q", branch);
				if (!rebased.ok) throw new Error(`${scope.name}'s work conflicts with ${scope.branch}: finish the rebase in ${scope.shown} with \`git rebase --continue\`, then jump ${diveId} again\n${rebased.text}`);
				notes.push(`rebased onto ${scope.branch}`);
			}
		}
		if (moved) {
			const orphaned = swapIgnored(hero, featId, scope);
			if (orphaned) notes.push(`ignored files from other work kept in ${relative(hero.dir, orphaned).replace(/\\/g, "/")}`);
		}
		if (runGit(scope.dir, "log", "-1", "--format=%s").text === wip(dive)) runGit(scope.dir, "reset", "-q", "--mixed", "HEAD^");
		const at = runGit(scope.dir, "rev-parse", "--short", "HEAD").text;
		lines.push(`- ${scope.name}: ${scope.shown} on ${at}${scope.branch ? `, working ${scope.branch}` : ", read-only"}${notes.length > 0 ? `; ${notes.join("; ")}` : ""}`);
	}
	recordDive(hero, dive, { action: "jump", heading: "Jumped", summary: `${me} picked it up`, meta: { diver: me, packer: null }, lines: [`${me} picked it up.`, "", ...lines], also }, ctx);
	mkdirSync(dirname(deckFile(hero)), { recursive: true });
	writeFileSync(deckFile(hero), `${diveId}\n`);

	const at = (path: string) => relative(ctx.cwd, path).replace(/\\/g, "/");
	const feat = heroDoc(hero, featId);
	ctx.out(`dive  ${at(dive.path)}`);
	if (feat) ctx.out(`feat  ${at(feat.path)}`);
	for (const scope of plan) ctx.out(`${scope.name}  ${at(scope.dir)}`);
}

/** Puts a checkout on the dive's local branch, as core's hydrate-repo starts one: at the work branch on origin, else trunk, tracking the work branch. */
function switchTo(dir: string, local: string, workBranch: string, trunk: string): void {
	if (!runGit(dir, "rev-parse", "--verify", "-q", `refs/heads/${local}`).ok) {
		const start = [`refs/remotes/origin/${workBranch}`, `refs/remotes/origin/${trunk}`].find((ref) => runGit(dir, "rev-parse", "--verify", "-q", ref).ok)!;
		runGit(dir, "branch", "-q", "--no-track", local, start);
	}
	runGit(dir, "config", `branch.${local}.remote`, "origin");
	runGit(dir, "config", `branch.${local}.merge`, `refs/heads/${workBranch}`);
	const switched = runGit(dir, "checkout", "-q", local);
	if (!switched.ok) throw new Error(`cannot put ${dir} on ${local}: ${switched.text}`);
}

/** Mints a dive on a feat, its scopes the feat's, naming its feat and linked from it; returns its id. */
function mintDive(hero: Hero, dir: string, feat: Doc): string {
	const id = mintUuid();
	const name = `${String(feat.fm.name)}.${id.slice(-6)}`;
	const scopes = readScopes(feat).map((entry) => (entry.branch ? { [entry.repoId]: { "work-branch": entry.branch } } : entry.repoId));
	const minted = mintKbDoc(dir, { kind: "dive", id, name, gist: `A dive on ${String(feat.fm.name)}`, title: name, meta: { feat: String(feat.fm.id) } });
	const doc = heroDoc(hero, minted.id)!;
	doc.yaml.set("scopes", scopes);
	writeKbDoc(doc.path, doc.yaml, doc.body);
	const links = Array.isArray(feat.fm.links) ? feat.fm.links : [];
	feat.yaml.set("links", [...links, { [keyOf(hero, doc)]: { rel: "dives.feat" } }]);
	writeKbDoc(feat.path, feat.yaml, feat.body);
	return id;
}
