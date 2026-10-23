import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a13354845c7253a55b60bba87285d8 as findKbDoc } from "nosedive-core";
import { i01a141f869c07c4da8288927a559c8ae as mintKbDoc } from "nosedive-core";
import { i01a1335480c776ba8945020d0af333eb as mintUuid } from "nosedive-core";
import { i01a15baf13e27bd88dc880d4871f2210 as hydrateRepo } from "nosedive-core";
import { i01a1335483aa776cb84df698b04adc06 as writeKbDoc } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, deckFile, diverOf, keyOf, onDeckId, quiet, readScopes, reachedAsFeat, refOf, repoDoc, wip, type Scope } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27d7c72258e54d02070189892 as recordDive, type Doc, type Ship } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

export async function i4b0709b1f9bf587aa8452f900544321e(args: Args, ctx: Ctx): Promise<void> {
	const ship = findBridge(ctx.cwd);
	if (!ship?.workspace) throw new Error("jump works in a ship, and this is not one: `nosedive seed` makes one");
	const ref = String(args.ref);
	const target = findKbDoc(ship.kbDir, ref);
	if (!target) throw new Error(`no doc ${ref} in the ship's kb`);
	const onDeck = onDeckId(ship);
	const me = diverOf(ship);
	const also: string[] = [];
	let diveId = ref;
	if (target.fm.kind !== "dive") {
		if (!reachedAsFeat(ship, ref)) throw new Error(`${String(target.fm.name)} is no feat: nothing reaches it from the ship's root through a .feat link; link it from a feat first`);
		if (onDeck) throw new Error(`dive ${onDeck} is on deck: pack, bail or land it first`);
		diveId = mintDive(ship, target, ctx);
		also.push(target.path);
	}
	if (onDeck && onDeck !== diveId) throw new Error(`dive ${onDeck} is on deck: pack, bail or land it first`);

	const dive = diveOnDeck(ship, ctx, diveId);
	const meta = (dive.doc.fm.meta ?? {}) as { diver?: unknown; outcome?: unknown };
	if (meta.outcome) throw new Error(`dive ${String(dive.doc.fm.name)} is over: it ${String(meta.outcome)}`);
	if (typeof meta.diver === "string" && meta.diver !== me) throw new Error(`dive ${String(dive.doc.fm.name)} is held by ${meta.diver}`);

	// Picking a dive up moves its checkouts, so nothing in them may be lost; jumping it again moves nothing.
	const again = onDeck === diveId;
	const work = new Map<Scope, string>();
	if (!again) {
		const refused: string[] = [];
		for (const scope of dive.scopes) {
			runGit(scope.dir, "fetch", "-q", "origin");
			const sha = fetchWork(scope.dir, diveId);
			if (sha) work.set(scope, sha);
			const shown = relative(ship.dir, scope.dir).replace(/\\/g, "/");
			if (runGit(scope.dir, "status", "--porcelain").text) refused.push(`${shown} has uncommitted changes`);
			else if (!held(scope.dir, scope.pin)) refused.push(`${shown} is on ${runGit(scope.dir, "rev-parse", "--short", "HEAD").text}, which no ref holds`);
		}
		if (refused.length > 0) throw new Error(`jump would lose work, so nothing moved:\n  ${refused.join("\n  ")}`);
	}

	const lines: string[] = [];
	for (const scope of dive.scopes) {
		const tip = tipOf(scope);
		if (!again) {
			const sha = work.get(scope);
			if (!sha) {
				// With no work yet, the dive starts from where its branch stands now.
				scope.pin = tip;
				runGit(scope.dir, "checkout", "-q", "--detach", scope.pin);
			} else {
				runGit(scope.dir, "checkout", "-q", "--detach", sha);
				if (tip !== scope.pin && runGit(scope.dir, "merge-base", "--is-ancestor", scope.pin, tip).ok) {
					writeFileSync(deckFile(ship), `${diveId}\n`);
					const rebased = runGit(scope.dir, "rebase", "-q", "--onto", tip, scope.pin);
					if (!rebased.ok) {
						throw new Error(`${scope.name}'s work conflicts with ${scope.branch ?? scope.trunk}: finish the rebase in ${relative(ship.dir, scope.dir).replace(/\\/g, "/")} with \`git rebase --continue\`, then jump ${diveId} again\n${rebased.text}`);
					}
				}
			}
		}
		// A rebase finished by hand moves the pin too.
		if (tip !== scope.pin && runGit(scope.dir, "merge-base", "--is-ancestor", scope.pin, tip).ok && runGit(scope.dir, "merge-base", "--is-ancestor", tip, "HEAD").ok) scope.pin = tip;
		if (runGit(scope.dir, "log", "-1", "--format=%s").text === wip(dive.doc)) runGit(scope.dir, "reset", "-q", "--mixed", "HEAD^");
		dive.doc.yaml.setIn(["scopes", dive.scopes.indexOf(scope), scope.repoId, "pin"], scope.pin);
		lines.push(`- ${scope.name}: ${relative(ship.dir, scope.dir).replace(/\\/g, "/")} on ${runGit(scope.dir, "rev-parse", "--short", "HEAD").text}, pinned at ${scope.pin.slice(0, 7)}${scope.branch ? `, working ${scope.branch}` : ", read-only"}`);
	}
	recordDive(ship, dive.doc, { action: "jump", heading: "Jumped", summary: `${me} picked it up`, meta: { diver: me, packer: null }, lines: [`${me} picked it up.`, "", ...lines], also }, ctx);
	mkdirSync(dirname(deckFile(ship)), { recursive: true });
	writeFileSync(deckFile(ship), `${diveId}\n`);

	const at = (path: string) => relative(ctx.cwd, path).replace(/\\/g, "/");
	ctx.out(`dive  ${at(dive.doc.path)}`);
	if (dive.feat) ctx.out(`feat  ${at(dive.feat.path)}`);
	for (const scope of dive.scopes) ctx.out(`${scope.name}  ${at(scope.dir)}`);
}

/** Mints a dive on a feat, pinned where each scope's branch stands, naming its feat and linked from it; returns its id. */
function mintDive(ship: Ship, feat: Doc, ctx: Ctx): string {
	const id = mintUuid();
	const name = `${String(feat.fm.name)}.${id.slice(-6)}`;
	const scopes = readScopes(feat).map((entry) => {
		const { dir, trunk } = hydrateRepo(ship, repoDoc(ship, entry.repoId), quiet(ctx));
		runGit(dir, "fetch", "-q", "origin");
		const pin = tipOf({ dir, trunk, branch: entry.branch });
		return { [entry.repoId]: entry.branch ? { "work-branch": entry.branch, pin } : { pin } };
	});
	const minted = mintKbDoc(ship.kbDir, { kind: "dive", id, name, gist: `A dive on ${String(feat.fm.name)}`, title: name, meta: { feat: String(feat.fm.id) } });
	const doc = findKbDoc(ship.kbDir, minted.id)!;
	doc.yaml.set("scopes", scopes);
	writeKbDoc(doc.path, doc.yaml, doc.body);
	const links = Array.isArray(feat.fm.links) ? feat.fm.links : [];
	feat.yaml.set("links", [...links, { [keyOf(ship, doc)]: { rel: "dives.feat" } }]);
	writeKbDoc(feat.path, feat.yaml, feat.body);
	return id;
}

/** Where the scope's work starts now: its work branch's tip when it has one, else trunk's. */
function tipOf(scope: { dir: string; trunk: string; branch?: string }): string {
	const branch = scope.branch && runGit(scope.dir, "rev-parse", "--verify", "-q", `refs/remotes/origin/${scope.branch}`);
	if (branch && branch.ok) return branch.text;
	const trunk = runGit(scope.dir, "rev-parse", "--verify", "-q", `refs/remotes/origin/${scope.trunk}`);
	if (!trunk.ok) throw new Error(`${scope.dir} has no origin/${scope.trunk}`);
	return trunk.text;
}

/** Fetches the dive's work from the repo's remote, returning its commit, or nothing when it has none. */
function fetchWork(dir: string, diveId: string): string | undefined {
	const ref = refOf(diveId);
	if (!runGit(dir, "ls-remote", "--exit-code", "origin", ref).ok) return undefined;
	const fetched = runGit(dir, "fetch", "-q", "origin", `+${ref}:${ref}`);
	if (!fetched.ok) throw new Error(`cannot fetch ${ref} in ${dir}: ${fetched.text}`);
	return runGit(dir, "rev-parse", ref).text;
}

/** Whether moving off HEAD loses nothing: the pin or some ref already holds it. */
function held(dir: string, pin: string): boolean {
	if (runGit(dir, "merge-base", "--is-ancestor", "HEAD", pin).ok) return true;
	return runGit(dir, "for-each-ref", "--count=1", "--contains", "HEAD", "refs/remotes", "refs/nosedive", "refs/heads").text !== "";
}
