import { existsSync } from "node:fs";
import { relative } from "node:path";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a141f869c07c4da8288927a559c8ae as mintKbDoc } from "nosedive-core";
import { i01a1335480c776ba8945020d0af333eb as mintUuid } from "nosedive-core";
import { i01a15baf13e27bd88dc880d4871f2210 as hydrateRepo } from "nosedive-core";
import { i01a13c760de87562b4738946402010b8 as checkoutPath } from "nosedive-core";
import { i01a147171f057d019118aaa1f269f5fd as findKind } from "nosedive-core";
import { pinOf } from "nosedive-core";
import { i01a1335483aa776cb84df698b04adc06 as writeKbDoc } from "nosedive-core";
import { WORK_ID, isDive as isWorkDive, emailOf, featOf, featRoot, fetchAll, heroDoc, heroTrunk, holderOf, keyOf, localBranch, metaOf, openDives, orphan, quiet, readScopes, repoDoc, scopesWith, swapIgnored, trunkOf, isWip, type ScopeEntry } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27d7c72258e54d02070189892 as recordDive, type Doc, type Hero } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

type Planned = ScopeEntry & { repo: Doc; name: string; dir: string; shown: string; local?: string; settled: boolean };

export async function if8cb5f3d6de95b8ea88d25f745af7b03(args: Args, ctx: Ctx): Promise<void> {
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("jump works in a hero repo, and this is not one: `nosedive seed` makes one");
	const me = emailOf(hero);
	const holder = holderOf(hero);
	const open = openDives(hero);
	const held = open.filter((doc) => metaOf(doc).diver === holder);
	const named = (doc: Doc) => `${String(doc.fm.name)} (${String(doc.fm.id)})`;

	let target: Doc;
	if (typeof args.ref === "string") {
		const found = heroDoc(hero, args.ref);
		if (!found) throw new Error(`no doc ${args.ref} in the hero`);
		target = found;
	} else if (held.length > 0) {
		target = held[0]!;
	} else {
		const free = open.filter((doc) => !metaOf(doc).diver && (metaOf(doc).packer ?? me) === me);
		if (free.length !== 1) throw new Error(free.length === 0 ? "no dive waits for you here: `nosedive jump <feat or dive>` names one" : `${free.length} dives wait for you, so name one:\n  ${free.map(named).join("\n  ")}`);
		target = free[0]!;
	}
	const isDive = isWorkDive(target);
	let at: string | undefined;
	if (isDive) {
		const meta = metaOf(target);
		if (meta.outcome) throw new Error(`dive ${String(target.fm.name)} is over: it ${meta.outcome}`);
		if (meta.diver && meta.diver !== holder) throw new Error(`dive ${String(target.fm.name)} is held by ${meta.diver.split("#")[0]}${meta.diver.startsWith(`${me}#`) ? " in another checkout of the hero" : ""}`);
	} else {
		at = featRoot(hero, String(target.fm.id));
		if (!at) throw new Error(`${String(target.fm.name)} is no feat: nothing reaches it from a root of the hero through a .feat link; link it from a feat first`);
	}
	if (held.length > 0 && !(isDive && held.some((doc) => doc.fm.id === target.fm.id))) {
		throw new Error(`this checkout of the hero holds dive ${held.map(named).join(", ")}: pack, bail or land it first`);
	}
	const again = isDive && metaOf(target).diver === holder;
	const diveId = isDive ? String(target.fm.id) : mintUuid();

	// A checkout already where the dive wants it is the diver's to change; any other must lose nothing by moving.
	const plan = readScopes(hero, target).map((entry): Planned => {
		const repo = repoDoc(hero, entry.repoId);
		const name = String(repo.fm.name);
		const dir = checkoutPath(hero, name);
		const local = entry.branch ? localBranch(hero, diveId) : undefined;
		const on = existsSync(dir) ? runGit(dir, "symbolic-ref", "-q", "--short", "HEAD") : undefined;
		const settled = local ? on?.text === local : on !== undefined && !on.ok && again;
		return { ...entry, repo, name, dir, shown: relative(hero.dir, dir).replace(/\\/g, "/"), local, settled };
	});
	const trunk = heroTrunk(hero);
	const refused = plan.filter((scope) => existsSync(scope.dir) && !scope.settled && runGit(scope.dir, "status", "--porcelain").text).map((scope) => `${scope.shown} has uncommitted changes or untracked files`);
	if (!again) {
		runGit(hero.dir, "fetch", "-q", "origin", `+refs/heads/${trunk}:refs/remotes/origin/${trunk}`, "+refs/nosedive/*:refs/nosedive/*");
		if (runGit(hero.dir, "status", "--porcelain").text) refused.unshift("the hero has uncommitted changes");
		const ahead = runGit(hero.dir, "rev-list", "--count", `refs/remotes/origin/${trunk}..HEAD`).text;
		if (ahead !== "0") refused.unshift(`the hero holds ${ahead} commit${ahead === "1" ? "" : "s"} ${trunk} lacks`);
	}
	if (refused.length > 0) throw new Error(`jump would lose work, so nothing moved:\n  ${refused.join("\n  ")}`);

	if (!isDive) diveKind(hero, ctx); // Refuse an unpublished schema before moving any checkout.
	const featId = isDive ? featOf(target) : String(target.fm.id);
	const lines: string[] = [];
	const moved: Planned[] = [];
	for (const scope of plan) {
		if (scope.settled) continue;
		const notes: string[] = [];
		if (!existsSync(scope.dir)) {
			hydrateRepo(hero, scope.repo, quiet(ctx), scope.local ? { id: diveId, workBranch: scope.branch! } : undefined);
		} else {
			fetchAll(scope.dir);
			const kept = orphan(hero, scope.dir);
			if (kept) notes.push(`its ${kept.commits.length} commit${kept.commits.length === 1 ? "" : "s"} origin lacked kept on ${kept.ref}`);
			const repoTrunk = trunkOf(scope.repo, scope.dir);
			if (scope.local) switchTo(scope.dir, scope.local, scope.branch!, repoTrunk);
			else runGit(scope.dir, "checkout", "-q", "--detach", `refs/remotes/origin/${repoTrunk}`);
		}
		moved.push(scope);
		if (scope.local) {
			// The dive's work may have been packed from another hero, or rebased there.
			const packed = newestRef(scope.dir, diveId);
			if (packed && !runGit(scope.dir, "merge-base", "--is-ancestor", packed, "HEAD").ok) {
				if (!runGit(scope.dir, "merge-base", "--is-ancestor", "HEAD", packed).ok) {
					const kept = orphan(hero, scope.dir);
					if (kept) notes.push(`its local commits kept on ${kept.ref}`);
				}
				runGit(scope.dir, "reset", "-q", "--hard", packed);
			}
			const branch = `refs/remotes/origin/${scope.branch}`;
			if (runGit(scope.dir, "rev-parse", "--verify", "-q", branch).ok && !runGit(scope.dir, "merge-base", "--is-ancestor", branch, "HEAD").ok) {
				const rebased = runGit(scope.dir, "rebase", "-q", branch);
				if (!rebased.ok) {
					runGit(scope.dir, "rebase", "--abort");
					throw new Error(`${scope.name}'s work conflicts with ${scope.branch}, so nothing was pushed: rebase ${scope.local} onto it in ${scope.shown}, then jump ${diveId} again\n${rebased.text}`);
				}
				notes.push(`rebased onto ${scope.branch}`);
			}
		}
		const head = runGit(scope.dir, "rev-parse", "--short", "HEAD").text;
		lines.push(`- ${scope.name}: ${scope.shown} on ${head}${scope.branch ? `, working ${scope.branch}` : ", read-only"}${notes.length > 0 ? `; ${notes.join("; ")}` : ""}`);
	}

	if (!again) {
		const refs = new Map<string, string | undefined>(plan.filter((scope) => scope.local).map((scope) => [scope.repoId, newestRef(scope.dir, diveId)]));
		const heroPacked = newestRef(hero.dir, diveId);
		refs.set(hero.id!, heroPacked);
		const replayed = heroPacked ? runGit(hero.dir, "rev-list", "--count", `refs/remotes/origin/${trunk}..${heroPacked}`).text : "0";
		if (replayed !== "0") lines.push(`- hero: ${replayed} commit${replayed === "1" ? "" : "s"} replayed`);
		for (let tries = 0; ; tries++) {
			runGit(hero.dir, "reset", "-q", "--hard", `refs/remotes/origin/${trunk}`);
			const also: string[] = [];
			if (!isDive) {
				const feat = heroDoc(hero, String(target.fm.id))!;
				mintDive(hero, at!, feat, diveId, ctx);
				also.push(feat.path);
			}
			const dive = heroDoc(hero, diveId);
			if (!dive || !isWorkDive(dive)) throw new Error(`${diveId} is no dive in the hero`);
			const { diver } = metaOf(dive);
			if (diver && diver !== holder) throw new Error(`dive ${String(dive.fm.name)} was picked up by ${diver.split("#")[0]} meanwhile`);
			recordDive(hero, dive, { action: "jump", label: "jumped", summary: `${me} picked it up`, meta: { diver: holder, packer: null }, scopes: scopesWith(hero, dive, refs), lines: [`${me} picked it up.`, "", ...lines], also }, ctx.capes[0]!.version);
			const bookkeeping = runGit(hero.dir, "rev-parse", "HEAD").text;
			if (heroPacked) {
				const base = runGit(hero.dir, "merge-base", heroPacked, `refs/remotes/origin/${trunk}`).text;
				const picked = runGit(hero.dir, "cherry-pick", "--allow-empty", `${base}..${heroPacked}`);
				if (!picked.ok) {
					runGit(hero.dir, "cherry-pick", "--abort");
					runGit(hero.dir, "reset", "-q", "--hard", `refs/remotes/origin/${trunk}`);
					throw new Error(`the dive's hero work conflicts with ${trunk}, so nothing was pushed:\n${picked.text}`);
				}
			}
			const pushed = runGit(hero.dir, "push", "-q", "origin", `${bookkeeping}:refs/heads/${trunk}`);
			if (pushed.ok) {
				runGit(hero.dir, "update-ref", `refs/remotes/origin/${trunk}`, bookkeeping);
				break;
			}
			if (tries === 2) {
				runGit(hero.dir, "reset", "-q", "--hard", `refs/remotes/origin/${trunk}`);
				throw new Error(`cannot push the hero's bookkeeping to ${trunk}: ${pushed.text}`);
			}
			runGit(hero.dir, "fetch", "-q", "origin", `+refs/heads/${trunk}:refs/remotes/origin/${trunk}`);
		}
	}

	const dive = heroDoc(hero, diveId)!;
	for (const scope of moved) {
		const orphaned = swapIgnored(hero, featId, scope);
		if (orphaned) ctx.out(`${scope.name}: ignored files from other work kept in ${relative(hero.dir, orphaned).replace(/\\/g, "/")}`);
	}
	for (const dir of [hero.dir, ...plan.map((scope) => scope.dir)]) {
		if (isWip(hero, dive, runGit(dir, "log", "-1", "--format=%s").text)) runGit(dir, "reset", "-q", "--mixed", "HEAD^");
	}

	const shown = (path: string) => relative(ctx.cwd, path).replace(/\\/g, "/");
	const feat = heroDoc(hero, featId);
	ctx.out(`dive  ${shown(dive.path)}`);
	if (feat) ctx.out(`feat  ${shown(feat.path)}`);
	for (const scope of plan) ctx.out(`${scope.name}  ${shown(scope.dir)}`);
}

/** The dive's newest ref in a repo, as last fetched. */
function newestRef(dir: string, diveId: string): string | undefined {
	const ref = runGit(dir, "for-each-ref", "--sort=-committerdate", "--format=%(objectname) %(refname)", "refs/nosedive/dives")
		.text.split("\n")
		.find((line) => line.endsWith(`/${diveId}`));
	return ref?.split(" ")[0];
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

/** Mints a dive on a feat, its scopes the feat's, naming its feat and linked from it. */
function mintDive(hero: Hero, dir: string, feat: Doc, id: string, ctx: Ctx): void {
	const name = `${String(feat.fm.name)}.${id.slice(-6)}`;
	const scopes: unknown[] = readScopes(hero, feat).map((entry) => ({ [entry.repoId]: entry.branch ? { "work-branch": entry.branch } : {} }));
	const { owner, pin } = diveKind(hero, ctx);
	if (owner !== hero.id) scopes.push({ [owner]: { canonical: true, ...pin } });
	const minted = mintKbDoc(dir, { kind: "dive", id, name, gist: `A dive on ${String(feat.fm.name)}`, title: name, meta: { feat: String(feat.fm.id) } });
	const doc = heroDoc(hero, minted.id)!;
	doc.yaml.set("scopes", scopes);
	writeKbDoc(doc.path, doc.yaml, doc.body);
	const links = Array.isArray(feat.fm.links) ? feat.fm.links : [];
	feat.yaml.set("links", [...links, { [keyOf(hero, doc)]: { rel: "dives.feat" } }]);
	writeKbDoc(feat.path, feat.yaml, feat.body);
}

/** Work's dive kind with the pin a dive is minted at, which refuses a schema that is not published. */
function diveKind(hero: Hero, ctx: Ctx) {
	const kind = findKind(`${WORK_ID}:dive`, hero, ctx.capes);
	if (!kind) throw new Error("work:dive names no kind here: the hero must wear the work cape");
	return { owner: kind.owner, pin: pinOf(kind, hero) };
}
