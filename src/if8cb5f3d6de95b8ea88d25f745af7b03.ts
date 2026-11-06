import { existsSync } from "node:fs";
import { relative } from "node:path";
import { featRoot, isDurable } from "nosedive-core";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a141f869c07c4da8288927a559c8ae as mintKbDoc } from "nosedive-core";
import { i01a1335480c776ba8945020d0af333eb as mintUuid } from "nosedive-core";
import { i01a15baf13e27bd88dc880d4871f2210 as hydrateRepo } from "nosedive-core";
import { i01a13c760de87562b4738946402010b8 as checkoutPath } from "nosedive-core";
import { i01a147171f057d019118aaa1f269f5fd as findKind } from "nosedive-core";
import { i01a18e2a3b4b798d98068d4778a158e6 as docKind } from "nosedive-core";
import { pinOf } from "nosedive-core";
import { i01a1335483aa776cb84df698b04adc06 as writeKbDoc } from "nosedive-core";
import { WORK_ID, isDive as isWorkDive, diveBranch, diveBranches, emailOf, featOf, fetchAll, fetchUpstream, heroBranch, heroDoc, homeOf, homeUpstream, isDiveRef, keyOf, metaOf, openDives, orphan, parseDiveBranch, pushRecord, readScopes, repoDoc, scopesWith, swapIgnored, syncHome, tokenOf, trunkOf, isWip, type ScopeEntry } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27d7c72258e54d02070189892 as recordDive, type Doc, type Hero } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

type Planned = ScopeEntry & { repo: Doc; name: string; dir: string; shown: string; local?: string; settled: boolean };

/**
 * What jump does with the hero: `again`, the dive already on deck, set up again with nothing recorded; `rebuild`, a dive
 * this checkout holds whose branch is gone, its branch cut again with nothing recorded; `record`, a dive picked up or minted.
 */
type Mode = "again" | "rebuild" | "record";

export async function if8cb5f3d6de95b8ea88d25f745af7b03(args: Args, ctx: Ctx): Promise<void> {
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("jump works in a hero repo, and this is not one: `nosedive seed` makes one");
	const me = emailOf(hero);
	const sure = args.sure === true;
	const named = (doc: Doc) => `${String(doc.fm.name)} (${String(doc.fm.id)})`;
	const on = heroBranch(hero);

	let target: Doc;
	let home: string;
	let token: string;
	let mode: Mode;
	const deck = parseDiveBranch(on);
	const deckDoc = deck && heroDoc(hero, deck.diveId);
	if (deck && deckDoc && isWorkDive(deckDoc)) {
		// On a dive branch, only its dive: set up again, losing nothing (one-dive-branch-per-checkout).
		if (typeof args.ref === "string" && args.ref !== deck.diveId) throw new Error(`the hero is on dive ${named(deckDoc)}'s branch: pack, land or bail it first`);
		target = deckDoc;
		token = deck.token;
		home = homeOf(hero, token) ?? missingHome(deckDoc);
		mode = "again";
	} else {
		home = on;
		if (runGit(hero.dir, "status", "--porcelain").text) throw new Error("the hero has uncommitted changes, and jump switches its branch: commit them first (jump-needs-clean-tree)");
		const up = homeUpstream(hero, home);
		// A dive minted or packed from another checkout sharing the home's upstream is there, not yet here.
		fetchUpstream(hero, up);
		syncHome(hero, home, up);
		token = tokenOf(hero, home);
		const holder = `${me}#${token}`;
		const open = openDives(hero);
		if (typeof args.ref === "string") {
			const found = heroDoc(hero, args.ref);
			if (!found) throw new Error(`no doc ${args.ref} in the hero on ${home}`);
			target = found;
		} else {
			const held = open.filter((doc) => metaOf(doc).diver === holder);
			const free = open.filter((doc) => !metaOf(doc).diver && (metaOf(doc).packer ?? me) === me);
			const waiting = held.length > 0 ? held : free;
			if (waiting.length !== 1) throw new Error(waiting.length === 0 ? "no dive waits for you here: `nosedive jump <feat or dive>` names one" : `${waiting.length} dives wait for you, so name one:\n  ${waiting.map(named).join("\n  ")}`);
			target = waiting[0]!;
		}
		const branches = diveBranches(hero);
		const mine = branches.find((each) => each.diveId === String(target.fm.id));
		if (branches.length > 0 && !mine) throw new Error(`this checkout has dive branch ${branches[0]!.branch}: switch to it, then pack, land or bail it first`);
		if (mine) {
			// Its own dive's branch, left by hand: back onto it, as on a dive branch.
			const switched = runGit(hero.dir, "checkout", "-q", mine.branch);
			if (!switched.ok) throw new Error(`cannot put the hero on ${mine.branch}: ${switched.text}`);
			token = mine.token;
			home = homeOf(hero, token) ?? missingHome(target);
			mode = "again";
		} else if (isWorkDive(target)) {
			const meta = metaOf(target);
			if (meta.outcome) throw new Error(`dive ${String(target.fm.name)} is over: it ${meta.outcome}`);
			if (meta.diver && meta.diver !== holder && !bareDiverIs(meta.diver, me)) {
				const [email, other] = meta.diver.split("#") as [string, string | undefined];
				if (!other) throw new Error(`dive ${String(target.fm.name)} is held by ${email}, in no checkout in particular: only a checkout whose git user.email is ${email} can take it over (legacy-bare-diver)`);
				const from = homeOf(hero, other);
				throw new Error(`dive ${String(target.fm.name)} is held by ${email}${from ? ` from ${from} in this checkout: switch to it, then jump it` : email === me ? " in another checkout of the hero: pack it there" : ""} (held-by-checkout)`);
			}
			if (!meta.diver && meta.packer && meta.packer !== me && !sure) throw new Error(`dive ${String(target.fm.name)} was packed by ${meta.packer}: jump it --sure to take it over, its work in progress included (take-over-with-sure)`);
			mode = meta.diver === holder ? "rebuild" : "record";
		} else {
			if (!featRoot(hero, String(target.fm.id))) throw new Error(`${String(target.fm.name)} is no feat: nothing reaches it from a root of the hero through a .feat link; link it from a feat first`);
			const off = offFringe(hero, target, ctx);
			if (off && !sure) throw new Error(`${off}, so next does not list it: jump it --sure to start a dive on it anyway (sure-off-fringe)`);
			mode = "record";
		}
	}

	const isDive = isWorkDive(target);
	const again = mode !== "record";
	const diveId = isDive ? String(target.fm.id) : mintUuid();
	const branch = diveBranch(token, diveId);
	const holder = `${me}#${token}`;

	// A checkout already where the dive wants it is the diver's to change; any other must lose nothing by moving.
	const plan = readScopes(hero, target).map((entry): Planned => {
		const repo = repoDoc(hero, entry.repoId);
		const name = String(repo.fm.name);
		const dir = checkoutPath(hero, name);
		const local = entry.branch ? branch : undefined;
		const at = existsSync(dir) ? runGit(dir, "symbolic-ref", "-q", "--short", "HEAD") : undefined;
		const settled = local ? at?.text === local : at !== undefined && !at.ok && again;
		return { ...entry, repo, name, dir, shown: relative(hero.dir, dir).replace(/\\/g, "/"), local, settled };
	});
	const refused = plan.filter((scope) => existsSync(scope.dir) && !scope.settled && runGit(scope.dir, "status", "--porcelain").text).map((scope) => `${scope.shown} has uncommitted changes or untracked files`);
	if (refused.length > 0) throw new Error(`jump would lose work, so nothing moved:\n  ${refused.join("\n  ")}`);

	const at = isDive ? undefined : featRoot(hero, String(target.fm.id));
	if (!isDive) diveKind(hero, ctx); // Refuse an unpublished schema before moving any checkout.
	const featId = isDive ? featOf(target) : String(target.fm.id);
	const lines: string[] = [];
	const moved: Planned[] = [];
	for (const scope of plan) {
		if (scope.settled) continue;
		const notes: string[] = [];
		if (!existsSync(scope.dir)) {
			// Hydrated detached, then put on the dive branch, which hydrate-repo would name after the hero's branch; where it
			// ends up is said in the record, so hydrate-repo's own line, naming the detached start, is not shown.
			hydrateRepo(hero, scope.repo, { out: () => undefined, err: ctx.err });
			fetchAll(scope.dir);
		} else {
			fetchAll(scope.dir);
			const kept = orphan(hero, scope.dir);
			if (kept) notes.push(`its ${kept.commits.length} commit${kept.commits.length === 1 ? "" : "s"} origin lacked kept on ${kept.ref}`);
		}
		const repoTrunk = trunkOf(scope.repo, scope.dir);
		if (scope.local) switchTo(scope.dir, scope.local, scope.branch!, repoTrunk);
		else runGit(scope.dir, "checkout", "-q", "--detach", `refs/remotes/origin/${repoTrunk}`);
		moved.push(scope);
		if (scope.local) {
			// The dive's work may have been packed from another checkout, or rebased there.
			const packed = newestRef(scope.dir, diveId);
			if (packed && !runGit(scope.dir, "merge-base", "--is-ancestor", packed, "HEAD").ok) {
				if (!runGit(scope.dir, "merge-base", "--is-ancestor", "HEAD", packed).ok) {
					const kept = orphan(hero, scope.dir);
					if (kept) notes.push(`its local commits kept on ${kept.ref}`);
				}
				runGit(scope.dir, "reset", "-q", "--hard", packed);
			}
			const workBranch = `refs/remotes/origin/${scope.branch}`;
			if (runGit(scope.dir, "rev-parse", "--verify", "-q", workBranch).ok && !runGit(scope.dir, "merge-base", "--is-ancestor", workBranch, "HEAD").ok) {
				const rebased = runGit(scope.dir, "rebase", "-q", workBranch);
				if (!rebased.ok) {
					runGit(scope.dir, "rebase", "--abort");
					throw new Error(`${scope.name}'s work conflicts with ${scope.branch}, so nothing was recorded: rebase ${scope.local} onto it in ${scope.shown}, then jump ${diveId} again\n${rebased.text}`);
				}
				notes.push(`rebased onto ${scope.branch}`);
			}
		}
		const head = runGit(scope.dir, "rev-parse", "--short", "HEAD").text;
		lines.push(`- ${scope.name}: ${scope.shown} on ${head}${scope.branch ? `, working ${scope.branch}` : ", read-only"}${notes.length > 0 ? `; ${notes.join("; ")}` : ""}`);
	}

	const heroPacked = newestRef(hero.dir, diveId);
	if (mode === "record") {
		const refs = new Map<string, string | undefined>(plan.filter((scope) => scope.local).map((scope) => [scope.repoId, newestRef(scope.dir, diveId)]));
		refs.set(hero.id!, heroPacked);
		const replayed = heroPacked ? runGit(hero.dir, "rev-list", "--count", heroPacked, "--not", `refs/heads/${home}`).text : "0";
		if (replayed !== "0") lines.push(`- hero: ${replayed} commit${replayed === "1" ? "" : "s"} replayed`);
		// On the home, pushed to its upstream (records-on-jumped-branch).
		pushRecord(hero, () => {
			const also: string[] = [];
			if (!isDive) {
				const feat = heroDoc(hero, String(target.fm.id))!;
				mintDive(hero, at!, feat, diveId, ctx);
				also.push(feat.path);
			}
			const dive = heroDoc(hero, diveId);
			if (!dive || !isWorkDive(dive)) throw new Error(`${diveId} is no dive in the hero`);
			const { diver } = metaOf(dive);
			if (diver && diver !== holder && !bareDiverIs(diver, me)) throw new Error(`dive ${String(dive.fm.name)} was picked up by ${diver.split("#")[0]} meanwhile`);
			recordDive(hero, dive, { action: "jump", label: "jumped", summary: `${me} picked it up`, meta: { diver: holder, packer: null }, scopes: scopesWith(hero, dive, refs), lines: [`${me} picked it up.`, "", ...lines], also }, ctx.capes[0]!.version);
		});
	}
	if (mode !== "again") {
		// The dive branch, cut from the home's tip after the jump record, its packed hero work replayed on it (dive-branches).
		runGit(hero.dir, "branch", "-q", "-f", branch, "HEAD");
		const switched = runGit(hero.dir, "checkout", "-q", branch);
		if (!switched.ok) throw new Error(`cannot put the hero on ${branch}: ${switched.text}`);
		if (heroPacked && !runGit(hero.dir, "merge-base", "--is-ancestor", heroPacked, "HEAD").ok) {
			const since = runGit(hero.dir, "merge-base", heroPacked, "HEAD").text;
			const picked = runGit(hero.dir, "cherry-pick", "--allow-empty", `${since}..${heroPacked}`);
			if (!picked.ok) {
				runGit(hero.dir, "cherry-pick", "--abort");
				throw new Error(`the dive's packed hero work conflicts with ${home}, so the hero is on ${branch} without it: it stays on ${heroPacked.slice(0, 7)}, to cherry-pick by hand\n${picked.text}`);
			}
		}
	}

	const dive = heroDoc(hero, diveId)!;
	for (const scope of moved) {
		const orphaned = swapIgnored(hero, featId, scope);
		if (orphaned) ctx.out(`${scope.name}: ignored files from other work kept in ${relative(hero.dir, orphaned).replace(/\\/g, "/")}`);
	}
	for (const dir of [hero.dir, ...plan.map((scope) => scope.dir)]) {
		if (isWip(dive, runGit(dir, "log", "-1", "--format=%s").text)) runGit(dir, "reset", "-q", "--mixed", "HEAD^");
	}

	const shown = (path: string) => relative(ctx.cwd, path).replace(/\\/g, "/");
	const feat = heroDoc(hero, featId);
	ctx.out(`dive  ${shown(dive.path)}`);
	if (feat) ctx.out(`feat  ${shown(feat.path)}`);
	for (const scope of plan) ctx.out(`${scope.name}  ${shown(scope.dir)}`);
}

function missingHome(dive: Doc): never {
	throw new Error(`dive ${String(dive.fm.name)}'s home, the branch it was jumped from, is gone: recreate it, as \`git branch <name> <commit>\``);
}

/** Why `next` would not list a feat: it is durable, or it has children, dives included; nothing when it is a non-durable leaf (sure-off-fringe). */
function offFringe(hero: Hero, doc: Doc, ctx: Ctx): string | undefined {
	const kind = docKind(doc, hero.id);
	const spelling = kind.owner === hero.id ? kind.name : `${kind.owner}:${kind.name}`;
	if (isDurable(findKind(spelling, hero, ctx.capes))) return `${String(doc.fm.name)} is durable`;
	const links = Array.isArray(doc.fm.links) ? doc.fm.links : [];
	const children = links.filter((entry) => entry && typeof entry === "object" && Object.values(entry as Record<string, { rel?: unknown } | null>).some((value) => typeof value?.rel === "string" && value.rel.endsWith(".feat") && value.rel !== "parent.feat"));
	if (children.length > 0) return `${String(doc.fm.name)} has ${children.length} child doc${children.length === 1 ? "" : "s"}, dives included, so it is no leaf`;
	return undefined;
}

/** The dive's newest ref in a repo, as last fetched. */
function newestRef(dir: string, diveId: string): string | undefined {
	const ref = runGit(dir, "for-each-ref", "--sort=-committerdate", "--format=%(objectname) %(refname)", "refs/nosedive")
		.text.split("\n")
		.find((line) => isDiveRef(line, diveId));
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

/** A diver legacy wrote, a bare email with no holder token, held by that email in no checkout in particular (legacy-bare-diver). */
function bareDiverIs(diver: string, email: string): boolean {
	return !diver.includes("#") && diver === email;
}
