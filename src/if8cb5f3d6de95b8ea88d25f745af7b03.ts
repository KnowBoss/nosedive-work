import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { featRoot, isDurable, kingsmetal } from "nosedive-core";
import type { Args, Ctx, Head, LocalMove, LocalStep, Sha, Step } from "nosedive-core";
import { replay } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a141f869c07c4da8288927a559c8ae as mintKbDoc } from "nosedive-core";
import { i01a1335480c776ba8945020d0af333eb as mintUuid } from "nosedive-core";
import { i01a1335482f876d6808aec457f512e80 as readKbDoc, type KbDoc } from "nosedive-core";
import { i01a15baf13e27bd88dc880d4871f2210 as hydrateRepo } from "nosedive-core";
import { i01a13c760de87562b4738946402010b8 as checkoutPath } from "nosedive-core";
import { i01a147171f057d019118aaa1f269f5fd as findKind } from "nosedive-core";
import { i01a18e2a3b4b798d98068d4778a158e6 as docKind } from "nosedive-core";
import { pinOf } from "nosedive-core";
import { WORK_ID, Stale, carry, diveBranch, diveBranches, emailOf, featOf, fetchAll, fetchHome, heroBranch, heroDoc, homeOf, homeUpdate, homeUpstream, isDive as isWorkDive, isDiveRef, isWip, keepOrphans, keyOf, metaOf, openDives, parseDiveBranch, planHome, readScopes, recordOn, replanning, repoDoc, resolveUpstream, scopesWith, swapIgnored, tokenOf, trunkOf, type HomePlan, type ScopeEntry } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import type { Doc, Hero } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a204ebdb4a799ba8119e92b0e93cc5 as refuseOwnScopes } from "./i01a204ebdb4a799ba8119e92b0e93cc5.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

type Planned = ScopeEntry & { repo: Doc; name: string; dir: string; shown: string; local?: string; settled: boolean };

/**
 * What jump does with the hero: `again`, the dive already on deck, set up again with nothing recorded; `rebuild`, a dive
 * this checkout holds whose branch is gone, its branch cut again with nothing recorded; `record`, a dive picked up or minted.
 */
type Mode = "again" | "rebuild" | "record";

const LISTED = /^(?:.*[\\/])?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.md$/i;

/** The commit a ref names, or null when there is none. */
function shaOf(dir: string, ref: string): Sha | null {
	return runGit(dir, "rev-parse", "--verify", "-q", `${ref}^{commit}`).text || null;
}

function isAncestor(dir: string, ancestor: Sha, of: Sha): boolean {
	return runGit(dir, "merge-base", "--is-ancestor", ancestor, of).ok;
}

/** Where HEAD is: a branch, or a detached commit. */
function headOf(dir: string): Head {
	const symbolic = runGit(dir, "symbolic-ref", "-q", "HEAD");
	return symbolic.ok ? { branch: symbolic.text.replace(/^refs\/heads\//, "") } : { detached: runGit(dir, "rev-parse", "HEAD").text };
}

const sameHead = (a: Head, b: Head) => ("branch" in a ? "branch" in b && a.branch === b.branch : "detached" in b && a.detached === b.detached);

export function if8cb5f3d6de95b8ea88d25f745af7b03(args: Args, ctx: Ctx): Promise<void> {
	return replanning(() => jumpOnce(args, ctx));
}

/**
 * One plan of a jump: every fetch, every validation, every record and branch worked out with nothing written but objects,
 * and a local-only sync of the home onto its upstream. Then one commit: the record and the hero's dive branch, which is
 * the commit point, and after it each scope's checkout. A refusal before the commit changes nothing but that sync, which
 * a refused jump says; one the commit finds stale plans again.
 */
async function jumpOnce(args: Args, ctx: Ctx): Promise<void> {
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("jump works in a hero repo, and this is not one: `nosedive seed` makes one");
	const me = emailOf(hero);
	const sure = args.sure === true;
	const named = (doc: Doc) => `${String(doc.fm.name)} (${String(doc.fm.id)})`;
	const on = heroBranch(hero);
	const version = ctx.capes[0]!.version;

	let target: Doc;
	let home: string;
	let token: string;
	let mode: Mode;
	let homePlan: HomePlan | undefined;
	let adopted: { message?: string; config: [string, string][] } = { config: [] };
	let synced = "";
	const deck = parseDiveBranch(on);
	const deckDoc = deck && heroDoc(hero, deck.diveId);
	try {
		if (deck && deckDoc && isWorkDive(deckDoc)) {
			// On a dive branch, only its dive: set up again, losing nothing (one-dive-branch-per-checkout).
			if (typeof args.ref === "string" && args.ref !== deck.diveId) throw new Error(`the hero is on dive ${named(deckDoc)}'s branch: pack, land or bail it first`);
			refuseOver(hero, deckDoc, on, deck.token);
			target = deckDoc;
			token = deck.token;
			home = homeOf(hero, token) ?? missingHome(deckDoc);
			mode = "again";
		} else {
			home = on;
			// Clean, so the disk jump validates against is the tree it publishes, and moving its files loses nothing (jump-needs-clean-tree).
			// The workspace holds the scopes jump hydrates, which a plan that runs again finds there: it is no change of the hero's.
			const inside = relative(hero.dir, hero.workspace).replace(/\\/g, "/");
			const dirty = runGit(hero.dir, "status", "--porcelain", "--", ".", ...(inside && !inside.startsWith("..") ? [`:(exclude)${inside}`] : [])).text;
			if (dirty) throw new Error("the hero has uncommitted changes, and jump switches its branch: commit them first (jump-needs-clean-tree)");
			const wanted = typeof args.ref === "string" ? args.ref.replace(LISTED, "$1").toLowerCase() : undefined;
			// The home onto its upstream, locally: nothing is pushed and no config is written until the commit.
			const resolved = resolveUpstream(hero, home);
			adopted = { message: resolved.adopted, config: resolved.config };
			homePlan = planHome(hero, home, resolved.up, fetchHome(hero, resolved.up));
			if (homePlan.tip !== homePlan.old) {
				carry({ steps: [{ repo: "hero", dir: hero.dir, local: { moves: [{ ref: `refs/heads/${home}`, old: homePlan.old, new: homePlan.tip }], files: { from: homePlan.old, to: homePlan.tip } } }] }, "jump");
				synced = `${home} was synced locally from ${homePlan.old.slice(0, 7)} to ${homePlan.tip.slice(0, 7)}, and nothing was published: fix what is refused above, then jump again`;
			}
			token = tokenOf(hero, home);
			const holder = `${me}#${token}`;
			const open = openDives(hero);
			if (wanted) {
				// A doc's path, as next prints it, names it by the quid it ends in (listed-paths-accepted).
				const found = heroDoc(hero, wanted);
				if (!found) throw new Error(`no doc ${String(args.ref)} in the hero on ${home}`);
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
				refuseOver(hero, target, mine.branch, mine.token);
				token = mine.token;
				home = homeOf(hero, token) ?? missingHome(target);
				const there = runGit(hero.dir, "rev-parse", `refs/heads/${mine.branch}`).text;
				carry({ steps: [{ repo: "hero", dir: hero.dir, local: { head: { from: { branch: on }, to: { branch: mine.branch } }, files: { from: runGit(hero.dir, "rev-parse", "HEAD").text, to: there } } }] }, "jump");
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
				// A bare jump is an attempt at all of the feat, so one with a dive on it, over or not, takes a dive planned with a brief (feat-jumps-bare).
				const dives = diveLinks(target);
				if (dives.length > 0) {
					const id = String(target.fm.id);
					throw new Error(
						`${String(target.fm.name)} has ${dives.length === 1 ? "a dive" : `${dives.length} dives`} on it (${dives.join(", ")}), so a bare jump would start it over, --sure or not: finish and drop ${dives.length === 1 ? "it" : "them"} first, or plan another dive saying what it does, then jump that:\n  nosedive crud work:dive <gist> --meta:feat ${id} --section:Brief -\n  nosedive jump <dive>`,
					);
				}
				const off = offFringe(hero, target, ctx);
				if (off && !sure) throw new Error(`${off}, so next does not list it: jump it --sure to start a dive on it anyway (sure-off-fringe)`);
				mode = "record";
			}
		}
		return await jumpPlanned({ ctx, hero, me, target, home, token, mode, homePlan, adopted, version });
	} catch (error) {
		// A jump that refuses after it synced the home says so.
		if (synced && error instanceof Error && !(error instanceof Stale)) error.message = `${error.message}\n${synced}`;
		throw error;
	}
}

type Planning = { ctx: Ctx; hero: Hero; me: string; target: Doc; home: string; token: string; mode: Mode; homePlan: HomePlan | undefined; adopted: { message?: string; config: [string, string][] }; version: string };

async function jumpPlanned({ ctx, hero, me, target, home, token, mode, homePlan, adopted, version }: Planning): Promise<void> {
	refuseOwnScopes(hero, target);
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
	const diveDoc = isDive ? target : undefined;
	const wipOn = (dir: string, sha: Sha) => (diveDoc && isWip(diveDoc, runGit(dir, "log", "-1", "--format=%s", sha).text) ? runGit(dir, "rev-parse", `${sha}^`).text : undefined);
	const lines: string[] = [];
	const warnings: string[] = [];
	const moved: Planned[] = [];
	const after: LocalStep[] = [];
	for (const scope of plan) {
		if (scope.settled) {
			// A checkout already on its dive branch: pack's work-in-progress commit on it is undone, its work back uncommitted.
			if (scope.local) {
				const top = runGit(scope.dir, "rev-parse", "HEAD").text;
				const parent = wipOn(scope.dir, top);
				if (parent) after.push({ repo: scope.name, dir: scope.dir, local: { moves: [{ ref: `refs/heads/${scope.local}`, old: top, new: parent }], files: { from: top, to: top, index: parent } } });
			}
			continue;
		}
		const notes: string[] = [];
		if (!existsSync(scope.dir)) {
			// Hydrated detached, then put on the dive branch, which hydrate-repo would name after the hero's branch; where it
			// ends up is said in the record, so hydrate-repo's own line, naming the detached start, is not shown.
			hydrateRepo(hero, scope.repo, { out: () => undefined, err: ctx.err });
		}
		fetchAll(scope.dir);
		const here = runGit(scope.dir, "rev-parse", "HEAD").text;
		const moves: LocalMove[] = [];
		const kept = new Map<string, { ref: string; commits: string[] }>();
		const keep = (tip: Sha) => {
			const orphaned = keepOrphans(hero, scope.dir, tip);
			if (!orphaned || kept.has(orphaned.ref)) return;
			moves.push(orphaned.move);
			kept.set(orphaned.ref, orphaned);
		};
		keep(here);
		const repoTrunk = trunkOf(scope.repo, scope.dir);
		let tip: Sha;
		let files: { from: Sha; to: Sha; index?: Sha } | undefined;
		let to: Head;
		let config: [string, string][] | undefined;
		if (scope.local) {
			const local = `refs/heads/${scope.local}`;
			const old = shaOf(scope.dir, local);
			const work = shaOf(scope.dir, `refs/remotes/origin/${scope.branch}`);
			tip = old ?? work ?? shaOf(scope.dir, `refs/remotes/origin/${repoTrunk}`)!;
			// The dive's work may have been packed from another checkout, or rebased there.
			const packed = newestRef(scope.dir, diveId);
			if (packed && !isAncestor(scope.dir, packed, tip)) {
				if (!isAncestor(scope.dir, tip, packed)) keep(tip);
				tip = packed;
			}
			if (work && !isAncestor(scope.dir, work, tip)) {
				const shas = runGit(scope.dir, "rev-list", "--reverse", "--topo-order", "--no-merges", tip, "--not", work).text.split("\n").filter(Boolean);
				const replayed = replay(scope.dir, shas, work);
				if ("conflict" in replayed) throw new Error(`${scope.name}'s work conflicts with ${scope.branch}, so nothing was recorded: rebase ${scope.local} onto it in ${scope.shown}, then jump ${diveId} again\n${replayed.conflict}`);
				tip = replayed.tip;
				notes.push(`rebased onto ${scope.branch}`);
			}
			// The branch is replaced by `tip`: whatever it held that `tip` lacks, a local merge included, stays on an orphan ref.
			if (old && !isAncestor(scope.dir, old, tip)) keep(old);
			const parent = wipOn(scope.dir, tip);
			files = { from: here, to: tip, ...(parent ? { index: parent } : {}) };
			moves.push({ ref: local, old, new: parent ?? tip });
			to = { branch: scope.local };
			config = [[`branch.${scope.local}.remote`, "origin"], [`branch.${scope.local}.merge`, `refs/heads/${scope.branch}`]];
		} else {
			tip = shaOf(scope.dir, `refs/remotes/origin/${repoTrunk}`)!;
			files = { from: here, to: tip };
			to = { detached: tip };
		}
		for (const each of kept.values()) {
			notes.push(`its ${each.commits.length} commit${each.commits.length === 1 ? "" : "s"} origin lacked kept on ${each.ref}, on this machine only`);
			warnings.push(`warning: ${scope.name} holds ${each.commits.length} commit${each.commits.length === 1 ? "" : "s"} no ref on origin has, which are on this machine only, under ${each.ref}:\n  ${each.commits.join("\n  ")}\nto recover ${each.commits.length === 1 ? "it" : "them"}: git switch -c <name> ${each.ref}`);
		}
		const from = headOf(scope.dir);
		after.push({ repo: scope.name, dir: scope.dir, local: { moves, ...(sameHead(from, to) ? {} : { head: { from, to } }), ...(files.from === files.to && !files.index ? {} : { files }), ...(config ? { config } : {}) } });
		moved.push(scope);
		lines.push(`- ${scope.name}: ${scope.shown} on ${tip.slice(0, 7)}, ${scope.branch ? `working ${scope.branch}` : "read-only"}${notes.length > 0 ? `; ${notes.join("; ")}` : ""}`);
	}

	const steps: Step[] = [];
	const heroPacked = newestRef(hero.dir, diveId);
	const heroLocal = `refs/heads/${branch}`;
	let record: { tip: Sha } | undefined;
	let upstreamNote = "";
	if (mode === "again") {
		// The dive branch is the hero's: only a work-in-progress commit on it is undone.
		const top = runGit(hero.dir, "rev-parse", "HEAD").text;
		const parent = wipOn(hero.dir, top);
		if (parent) steps.push({ repo: "hero", dir: hero.dir, local: { moves: [{ ref: heroLocal, old: top, new: parent }], files: { from: top, to: top, index: parent } } });
	} else {
		const up = homePlan!;
		let base = up.tip;
		let update: ReturnType<typeof homeUpdate> | undefined;
		if (mode === "record") {
			const refs = new Map<string, string | undefined>(plan.filter((scope) => scope.local).map((scope) => [scope.repoId, newestRef(scope.dir, diveId)]));
			refs.set(hero.id!, heroPacked);
			const replayed = heroPacked ? runGit(hero.dir, "rev-list", "--count", heroPacked, "--not", `refs/heads/${home}`).text : "0";
			if (replayed !== "0") lines.push(`- hero: ${replayed} commit${replayed === "1" ? "" : "s"} replayed`);
			let rel: string;
			let minted: { doc: KbDoc; extra: Record<string, string> } | undefined;
			if (!isDive) {
				const feat = heroDoc(hero, String(target.fm.id))!;
				minted = mintedDive(hero, at!, feat, diveId, ctx);
				rel = relative(hero.dir, join(at!, `${diveId}.md`)).replace(/\\/g, "/");
			} else {
				const found = heroDoc(hero, diveId);
				if (!found || !isWorkDive(found)) throw new Error(`${diveId} is no dive in the hero`);
				rel = keyOf(hero, found);
			}
			const doc = minted ? minted.doc : heroDoc(hero, diveId)!;
			const current = isDive ? metaOf(heroDoc(hero, diveId)!).diver : undefined;
			if (current && current !== holder && !bareDiverIs(current, me)) throw new Error(`dive ${String(doc.fm.name)} was picked up by ${current.split("#")[0]} meanwhile`);
			const change = { action: "jump", label: "jumped", summary: `${me} picked it up`, meta: { diver: holder, packer: null }, scopes: scopesWith(hero, doc as never, refs), lines: [`${me} picked it up.`, "", ...lines] };
			record = recordOn(hero, up.tip, rel, change, version, { base: minted?.doc ?? undefined, extra: minted?.extra });
			base = record.tip;
			update = homeUpdate(up, record.tip, [record.tip]);
			if (up.published.length > 0) upstreamNote = [`jump: published ${up.published.length} commit${up.published.length === 1 ? "" : "s"} nosedive made on ${home} to ${up.up.remote}/${up.up.name} with its record:`, ...up.published.map((commit) => `${commit.sha.slice(0, 7)} ${commit.subject}`)].join("\n");
		}
		// The dive branch, cut from the home's tip after the jump record, its packed hero work replayed on it (dive-branches).
		let dTip = base;
		if (heroPacked && !isAncestor(hero.dir, heroPacked, base)) {
			const since = runGit(hero.dir, "merge-base", heroPacked, base).text;
			// A turn the pack carried is on the home already, as its own commit there: `cherry` marks it `-`, and it is left out.
			const fresh = runGit(hero.dir, "cherry", base, heroPacked, since).text.split("\n").filter((line) => line.startsWith("+ ")).map((line) => line.slice(2));
			if (fresh.length > 0) {
				const replayed = replay(hero.dir, fresh, base);
				if ("conflict" in replayed) throw new Error(`the dive's packed hero work conflicts with ${home}, so nothing was recorded: it stays on ${heroPacked.slice(0, 7)}, to cherry-pick by hand\n${replayed.conflict}`);
				dTip = replayed.tip;
			}
		}
		const parent = wipOn(hero.dir, dTip);
		const moves: LocalMove[] = [];
		if (record) moves.push({ ref: `refs/heads/${home}`, old: up.tip, new: record.tip });
		moves.push({ ref: heroLocal, old: shaOf(hero.dir, heroLocal), new: parent ?? dTip });
		steps.push({
			repo: "hero",
			dir: hero.dir,
			...(update ? { remote: { name: up.up.remote, updates: [update] } } : {}),
			local: { moves, head: { from: { branch: home }, to: { branch } }, files: { from: up.tip, to: dTip, ...(parent ? { index: parent } : {}) }, ...(adopted.config.length > 0 ? { config: adopted.config } : {}) },
		});
	}

	// The commit point is the hero's step, with its record; the scopes follow it.
	carry({ steps, after }, "jump");

	if (adopted.message) ctx.out(adopted.message);
	if (upstreamNote) ctx.out(upstreamNote);
	for (const warning of warnings) ctx.err(warning);
	const dive = heroDoc(hero, diveId)!;
	for (const scope of moved) {
		const orphaned = swapIgnored(hero, featId, scope);
		if (orphaned) ctx.out(`${scope.name}: ignored files from other work kept in ${relative(hero.dir, orphaned).replace(/\\/g, "/")}`);
	}

	const shown = (path: string) => relative(ctx.cwd, path).replace(/\\/g, "/");
	const feat = heroDoc(hero, featId);
	ctx.out(`dive  ${shown(dive.path)}`);
	if (feat) ctx.out(`feat  ${shown(feat.path)}`);
	for (const scope of plan) ctx.out(`${scope.name}  ${shown(scope.dir)}`);
	// The agent that jumped does the work, but puts it down only on the pilot's say (jump-starts-the-work).
	const brief = /(?:^|\n)## Brief\n/.test(dive.body) || !feat ? dive : feat;
	ctx.out(`Now do the dive's work, from its brief, ${shown(brief.path)}, to its feat's Done when; pack or land it only when the pilot asks.`);
}

/** Refuses a dive that is over, landed or bailed, whose branch is still in this checkout, saying how to leave it. */
function refuseOver(hero: Hero, dive: Doc, branch: string, token: string): void {
	const { outcome } = metaOf(dive);
	if (!outcome) return;
	const home = homeOf(hero, token);
	throw new Error(`dive ${String(dive.fm.name)} is over: it ${outcome}; to leave its branch, switch to its home${home ? `, ${home}` : ""}, the branch it was jumped from, and delete ${branch}`);
}

function missingHome(dive: Doc): never {
	throw new Error(`dive ${String(dive.fm.name)}'s home, the branch it was jumped from, is gone: recreate it, as \`git branch <name> <commit>\``);
}

/** The paths of the dives a feat links `dives.feat`. */
function diveLinks(doc: Doc): string[] {
	const links = Array.isArray(doc.fm.links) ? doc.fm.links : [];
	return links.flatMap((entry) => Object.entries((entry ?? {}) as Record<string, { rel?: unknown } | null>).filter(([, value]) => value?.rel === "dives.feat").map(([target]) => target));
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


/** A dive minted on a feat, its scopes the feat's, naming its feat and linked from it, made in memory: its doc, and the feat's text with the link. Nothing is written. */
function mintedDive(hero: Hero, dir: string, feat: Doc, id: string, ctx: Ctx): { doc: KbDoc; extra: Record<string, string> } {
	const name = `${id.slice(-6)}.${String(feat.fm.name)}`;
	const scopes: unknown[] = readScopes(hero, feat).map((entry) => ({ [entry.repoId]: entry.branch ? { "work-branch": entry.branch } : {} }));
	const { owner, pin } = diveKind(hero, ctx);
	if (owner !== hero.id) scopes.push({ [owner]: { canonical: true, ...pin } });
	const rel = relative(hero.dir, join(dir, `${id}.md`)).replace(/\\/g, "/");
	// mintKbDoc writes the doc's text; made in a scratch dir, it is read back and nothing is left in the hero.
	const scratch = mkdtempSync(join(tmpdir(), "nosedive-mint-"));
	try {
		const minted = mintKbDoc(scratch, { kind: "dive", id, name, gist: `An attempt to complete ${String(feat.fm.name)}`, title: name, meta: { feat: String(feat.fm.id) } });
		const doc = readKbDoc(readFileSync(minted.path, "utf8"), rel);
		doc.yaml.set("scopes", scopes);
		doc.fm = doc.yaml.toJS() as Record<string, unknown>;
		const links = Array.isArray(feat.fm.links) ? feat.fm.links : [];
		feat.yaml.set("links", [...links, { [rel]: { rel: "dives.feat" } }]);
		kingsmetal(feat.yaml);
		return { doc, extra: { [keyOf(hero, feat)]: `---\n${feat.yaml.toString({ lineWidth: 0 })}---\n${feat.body}` } };
	} finally {
		rmSync(scratch, { recursive: true, force: true });
	}
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
