import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { unzipSync, zipSync } from "fflate";
import type { Cape } from "nosedive-core";
import { i01a138b2b8ee703cab227b010f588b6a as locateKbDoc } from "nosedive-core";
import { i01a13c760de87562b4738946402010b8 as checkoutPath } from "nosedive-core";
import { i01a13dee4b1d78f7a699c3777bf63587 as readRepoConfig } from "nosedive-core";
import { i01a147171f057d019118aaa1f269f5fd as findKind, isDurable } from "nosedive-core";
import { i01a18e2a3b4b798d98068d4778a158e6 as docKind } from "nosedive-core";
import { CORE_OWNER, featTree } from "nosedive-core";
import { commitOffside, commitPlan, describeRefusal, docAt, fetchExact, ownedRange, replay, snapshot, type KbDoc, type LocalMove, type Plan, type RemoteUpdate, type Sha, type Step } from "nosedive-core";
import { i01a1901e263b7209a4b5f39a71c568b3 as featWalk } from "nosedive-core";
import { i01a15bb27d7c72258e54d02070189892 as recordDive, type Change, type Doc, type Hero } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

/** Work's seeded id, which owns the dive kind. */
export const WORK_ID = "01a15bb1-da9e-7d2d-aa82-5ee97257adc6";

/** Whether a doc's kind is work's dive, whichever repo holds the doc. */
export function isDive(doc: Doc): boolean {
	const kind = docKind(doc);
	return kind.owner === WORK_ID && kind.name === "dive";
}

/** Ignored files an install or a build remakes, which packs leave out. */
const REBUILDABLE = /(^|\/)(node_modules|dist|build)\//;

/** One repo a feat or dive works in: its work goes to `branch`, a scope with none is read-only, and `ref` is its dive ref as last seen. */
export type ScopeEntry = { repoId: string; branch?: string; ref?: string };
/** A scope with its checkout, which is the dive's when on the dive's local branch, or present when read-only. */
export type Scope = ScopeEntry & { repo: Doc; name: string; dir: string; trunk: string; ours: boolean };
/** The dive on deck: its doc, its feat, its scopes, the hero's dive branch, its token, and its home, the branch it was jumped from. */
export type Dive = { hero: Hero; doc: Doc; feat: Doc | undefined; scopes: Scope[]; branch: string; token: string; home: string };
type Say = { out(text: string): void; err(text: string): void };

/** The hero's git user.email, which names a packer and starts a diver. */
export function emailOf(hero: Hero): string {
	const email = runGit(hero.dir, "config", "user.email").text;
	if (!email) throw new Error("git has no user.email here, and a dive is held by one: set it with `git config user.email`");
	return email;
}

/** The hero checkout's branch, which names a dive's local branch. */
export function heroBranch(hero: Hero): string {
	const on = runGit(hero.dir, "symbolic-ref", "-q", "--short", "HEAD");
	if (!on.ok) throw new Error("the hero is detached, so a dive's work has no branch to be named after: put the hero on a branch first");
	return on.text;
}

/** The hero's trunk: the branch origin's HEAD named when last fetched. */
export function heroTrunk(hero: Hero): string {
	return runGit(hero.dir, "symbolic-ref", "-q", "--short", "refs/remotes/origin/HEAD").text.replace(/^origin\//, "") || "main";
}

/**
 * The holder token of this checkout on a branch, as core's holder-token makes it for a checkout on that branch: the first
 * 12 hex digits of the sha256 of `<top level>/<branch>/<email>` (held-by-checkout).
 */
export function tokenOf(hero: Hero, branch: string): string {
	const email = emailOf(hero);
	const top = runGit(hero.dir, "rev-parse", "--show-toplevel").text;
	return createHash("sha256").update(`${top}/${branch}/${email}`).digest("hex").slice(0, 12);
}

/** Who holds a dive jumped from a branch of this checkout: `<email>#<token>`, the email for whoever reads the doc, the token what is compared. */
export function diverOf(hero: Hero, branch: string): string {
	return `${emailOf(hero)}#${tokenOf(hero, branch)}`;
}

const DIVE_BRANCH = /^nosedive-([0-9a-f]{12})-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** A dive's branch, in the hero and in each writable scope (dive-branches): one segment, so no branch can clash with it (dive-branch-dashes). */
export function diveBranch(token: string, diveId: string): string {
	return `nosedive-${token}-${diveId}`;
}

/** The token and dive id a branch name carries when it is named as a dive branch. */
export function parseDiveBranch(name: string): { token: string; diveId: string } | undefined {
	const match = DIVE_BRANCH.exec(name);
	return match ? { token: match[1]!, diveId: match[2]! } : undefined;
}

/**
 * This checkout's dive branches: local branches named as dive branches whose token is one of this checkout's branches'.
 * Worktrees of the hero share their branches, and another worktree's dive branch carries its tokens, not this one's.
 */
export function diveBranches(hero: Hero): { branch: string; token: string; diveId: string }[] {
	const tokens = new Set(localBranches(hero).filter((branch) => !parseDiveBranch(branch)).map((branch) => tokenOf(hero, branch)));
	return localBranches(hero).flatMap((branch) => {
		const parsed = parseDiveBranch(branch);
		return parsed && tokens.has(parsed.token) ? [{ branch, ...parsed }] : [];
	});
}

function localBranches(hero: Hero): string[] {
	return runGit(hero.dir, "for-each-ref", "--format=%(refname:short)", "refs/heads/").text.split("\n").filter(Boolean);
}

/** A dive's home: the local branch of this checkout whose holder token is the dive branch's (loop-returns-home). */
export function homeOf(hero: Hero, token: string): string | undefined {
	return localBranches(hero).find((branch) => !parseDiveBranch(branch) && tokenOf(hero, branch) === token);
}

/** A branch's upstream: the remote, the branch's name there, and the ref it is fetched to; nothing when it has none. */
export type Upstream = { remote: string; name: string; ref: string };
export function upstreamOf(hero: Hero, branch: string): Upstream | undefined {
	const remote = runGit(hero.dir, "config", `branch.${branch}.remote`).text;
	const merge = runGit(hero.dir, "config", `branch.${branch}.merge`).text;
	if (!remote || remote === "." || !merge.startsWith("refs/heads/")) return undefined;
	const name = merge.slice("refs/heads/".length);
	return { remote, name, ref: `refs/remotes/${remote}/${name}` };
}

/** A dive's home with its upstream, refusing one with none: the dive's records would be stranded in a local branch (records-on-jumped-branch). */
export function homeUpstream(hero: Hero, home: string): Upstream {
	const up = upstreamOf(hero, home);
	if (!up) throw new Error(`${home} has no upstream, so the dive's records would be stranded here: push it first, as \`git push -u origin ${home}\``);
	return up;
}

/** Runs a git command that must succeed, naming it when it does not. */
function must(dir: string, ...args: string[]): string {
	const result = runGit(dir, ...args);
	if (!result.ok) throw new Error(`git ${args.join(" ")} failed in ${dir}: ${result.text}`);
	return result.text;
}

/** `<sha> <subject>` of each commit, as jump lists what it published. */
function listed(commits: { sha: string; subject: string }[]): string[] {
	return commits.map((commit) => `${commit.sha.slice(0, 7)} ${commit.subject}`);
}

/** A refusal a plan's commit met because something moved, which a command plans again from a fresh fetch (at most three times). */
export class Stale extends Error {}

/** Carries a plan out; a refusal says what was done, and a stale one is the cue to plan again. */
export function carry(plan: Plan, command: string): void {
	const done = commitPlan(plan, command);
	if (done.ok) return;
	const message = describeRefusal(done.refusal);
	// Planning again cannot free a branch another worktree holds.
	throw done.refusal.kind === "stale" && !/is checked out in/.test(done.refusal.detail) ? new Stale(message) : new Error(message);
}

/** Plans and carries out again from a fresh fetch while the commit finds the world moved, at most three times. */
export async function replanning<T>(attempt: () => Promise<T> | T): Promise<T> {
	for (let tries = 0; ; tries++) {
		try {
			return await attempt();
		} catch (error) {
			if (!(error instanceof Stale) || tries === 2) throw error;
		}
	}
}

/** The home's upstream: its own, or origin's trunk when the home has none and shares history with it, adopted in memory only; the config that would keep it is for the commit to write (jump-adopts-trunk-sharing-history). */
export function resolveUpstream(hero: Hero, home: string): { up: Upstream; adopted?: string; config: [string, string][] } {
	const own = upstreamOf(hero, home);
	if (own) return { up: own, config: [] };
	// Origin's own word for its default branch, not a possibly stale origin/HEAD; offline is no reason to say the home has no upstream.
	const asked = runGit(hero.dir, "ls-remote", "--symref", "origin", "HEAD");
	if (!asked.ok) throw new Error(`cannot reach origin to find ${home}'s trunk, so nothing was changed (offline?): ${asked.text}`);
	const trunk = /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(asked.text)?.[1] ?? originTrunk(hero.dir);
	const up: Upstream = { remote: "origin", name: trunk, ref: `refs/remotes/origin/${trunk}` };
	const fetched = runGit(hero.dir, "fetch", "-q", "origin", `+refs/heads/${trunk}:${up.ref}`);
	if (!fetched.ok) throw new Error(`cannot fetch origin/${trunk}, so ${home} was left without an upstream (offline?): ${fetched.text}`);
	if (!runGit(hero.dir, "merge-base", up.ref, `refs/heads/${home}`).ok) return { up: homeUpstream(hero, home), config: [] };
	return { up, adopted: `jump: ${home} had no upstream; set it to origin/${trunk}, which it is cut from`, config: [[`branch.${home}.remote`, "origin"], [`branch.${home}.merge`, `refs/heads/${trunk}`]] };
}

/** Fetches a branch's upstream and reads its sha once, which every lease and range is built on, and the nosedive refs from origin; refuses when either fails, rather than go on with a tracking ref gone stale. */
export function fetchHome(hero: Hero, up: Upstream): Sha {
	const ref = `refs/heads/${up.name}`;
	let tip: Sha | null | undefined;
	let why = "";
	try {
		tip = fetchExact(hero.dir, up.remote, [ref])[ref];
	} catch (error) {
		why = `: ${(error as Error).message}`;
	}
	if (!tip) throw new Error(`cannot fetch ${up.remote}/${up.name}, so nothing was changed (offline, or the branch is gone?)${why}`);
	const refs = runGit(hero.dir, "fetch", "-q", "--prune", "origin", "+refs/nosedive/*:refs/nosedive/*");
	if (!refs.ok) throw new Error(`cannot fetch origin's nosedive refs, so nothing was changed (offline?): ${refs.text}`);
	return tip;
}

/**
 * What a home's unpushed commits become on its upstream, worked out off to the side: no working tree, no ref and no remote is
 * touched. `upstream` is the sha the plan is leased on. Refused when any commit is not nosedive's, or one conflicts with the
 * upstream as it moved. The convention that a commit with nosedive as committer is nosedive's is no proof of who made it.
 * `set` is what a push of `tip` newly publishes: nosedive's own commits, or the ones the replay made.
 */
export type HomePlan = { home: string; up: Upstream; old: Sha; upstream: Sha; tip: Sha; set: Set<Sha>; ahead: { sha: string; subject: string }[]; published: { sha: string; subject: string }[] };

export function planHome(hero: Hero, home: string, up: Upstream, upstream: Sha): HomePlan {
	const plan = planHomeOnto(hero, home, up, upstream);
	// What a push of the tip newly publishes, which a replay may have made fewer than the home held.
	return { ...plan, published: ownedRange(hero.dir, upstream, plan.tip) };
}

function planHomeOnto(hero: Hero, home: string, up: Upstream, upstream: Sha): Omit<HomePlan, "published"> {
	const old = must(hero.dir, "rev-parse", `refs/heads/${home}`);
	const ahead = ownedRange(hero.dir, upstream, old);
	const others = ahead.filter((commit) => !commit.own);
	if (others.length > 0) throw new Error(`${home} holds ${others.length} commit${others.length === 1 ? "" : "s"} ${up.remote}/${up.name} lacks that nosedive did not commit: push or drop ${others.length === 1 ? "it" : "them"} first:\n  ${listed(others).join("\n  ")}`);
	if (must(hero.dir, "rev-list", "--count", `${old}..${upstream}`) === "0") return { home, up, old, upstream, tip: old, set: new Set(ahead.map((commit) => commit.sha)), ahead };
	if (ahead.some((commit) => commit.merge)) throw new Error(`${home} holds a merge commit ${up.remote}/${up.name} lacks, which is not replayed onto a moved upstream: push or drop it first`);
	const replayed = replay(hero.dir, ahead.map((commit) => commit.sha), upstream);
	if ("conflict" in replayed) throw new Error(`the ${ahead.length} commit${ahead.length === 1 ? "" : "s"} nosedive made on ${home} conflict${ahead.length === 1 ? "s" : ""} with ${up.remote}/${up.name} as it moved, so nothing was changed: push or drop ${ahead.length === 1 ? "it" : "them"} first: ${replayed.conflict}`);
	return { home, up, old, upstream, tip: replayed.tip, set: replayed.made, ahead };
}

/** The remote update that publishes a home plan's commits and, last, a record on top of them. */
export function homeUpdate(plan: HomePlan, tip: Sha, also: Iterable<Sha> = []): RemoteUpdate {
	return { ref: `refs/heads/${plan.up.name}`, old: plan.upstream, new: tip, fastForward: true, publishes: new Set([...plan.set, ...also]) };
}

/** The commits `tip` adds to a remote ref that held `old`, as git lists them now; for a dive's own ref, every one of which is the dive's work (dive-work-is-the-divers). */
export function diveWork(dir: string, tip: Sha, old: Sha | null): Set<Sha> {
	return new Set(must(dir, "rev-list", tip, ...(old ? ["--not", old] : ["--not", "--remotes=origin"])).split("\n").filter(Boolean));
}

/** Fetches a repo's branches and nosedive refs from origin. */
export function fetchAll(dir: string): void {
	runGit(dir, "fetch", "-q", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*", "+refs/nosedive/*:refs/nosedive/*");
}

/** Where a dive's work is kept on each repo's origin, whichever checkout of the hero packs it. */
export function diveRef(hero: Hero, diveId: string): string {
	return `refs/nosedive/${hero.id}/dives/${diveId}`;
}

/** The subject of the commit pack makes of uncommitted work, which jump undoes. */
export function wip(dive: Doc): string {
	return `pack(${String(dive.fm.name)}): work in progress`;
}

/** Whether a commit's subject is this dive's work in progress, as pack names it, or as it named it while feats grouped the loop's commits, whatever the feat's name; another dive's is not. */
export function isWip(dive: Doc, subject: string): boolean {
	const name = String(dive.fm.name);
	return subject === `pack(${name}): work in progress` || /^(?:feat\([^)]*\): pack |pack: )work in progress on (.*)$/.exec(subject)?.[1] === name;
}

/** Whether a ref holds the dive's work, under its name now or before hero-dive-refs: a `dives` segment, the dive's id last. */
export function isDiveRef(ref: string, diveId: string): boolean {
	return ref.includes("/dives/") && ref.endsWith(`/${diveId}`);
}

/** Every ref of the dive on origin, under any name it was pushed to, newest first, as last fetched. */
export function diveRefs(dir: string, diveId: string): { ref: string; sha: string }[] {
	return runGit(dir, "ls-remote", "origin", "refs/nosedive/*")
		.text.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [sha, ref] = line.split("\t") as [string, string];
			return { ref, sha };
		})
		.filter(({ ref }) => isDiveRef(ref, diveId))
		.sort((a, b) => Number(runGit(dir, "log", "-1", "--format=%ct", b.sha).text || 0) - Number(runGit(dir, "log", "-1", "--format=%ct", a.sha).text || 0));
}

/** Where commits moved off are kept on this machine: outside `refs/nosedive`, which a fetch prunes to what origin holds. */
const ORPHANS = "refs/nosedive-orphans";

/** The commits `tip` holds that no branch or nosedive ref on origin does, as last fetched, nor a local orphan ref, by sha and subject. */
export function unpushed(dir: string, tip = "HEAD"): string[] {
	return runGit(dir, "log", "--format=%h %s", tip, "--not", "--remotes=origin", "--glob=refs/nosedive/*", `--glob=${ORPHANS}/*`).text.split("\n").filter(Boolean);
}

/**
 * The local ref that keeps `tip` when moving off it would leave commits no ref on origin holds, and the move that makes it;
 * nothing when it holds none. Never pushed: an orphan is a person's commit made outside any dive (dive-work-is-the-divers).
 */
export function keepOrphans(hero: Hero, dir: string, tip: Sha): { ref: string; commits: string[]; move: LocalMove } | undefined {
	const commits = unpushed(dir, tip);
	if (commits.length === 0) return undefined;
	const ref = `${ORPHANS}/${hero.id}/${tip}`;
	return { ref, commits, move: { ref, old: runGit(dir, "rev-parse", "--verify", "-q", ref).text || null, new: tip } };
}

/** The repo's trunk: its `meta.trunk`, else the branch origin's HEAD named when last fetched. */
export function trunkOf(repo: Doc, dir: string): string {
	const trunk = (repo.fm.meta as { trunk?: unknown } | undefined)?.trunk;
	if (typeof trunk === "string") return trunk;
	return existsSync(dir) ? originTrunk(dir) : "main";
}

/** The branch origin's HEAD named when last fetched, else main. */
function originTrunk(dir: string): string {
	return runGit(dir, "symbolic-ref", "-q", "--short", "refs/remotes/origin/HEAD").text.replace(/^origin\//, "") || "main";
}

/** Where a scope's work starts: its work branch on origin when there is one, else trunk. */
export function baseOf(scope: { dir: string; branch?: string; trunk: string }): string {
	const branch = `refs/remotes/origin/${scope.branch}`;
	return scope.branch && runGit(scope.dir, "rev-parse", "--verify", "-q", branch).ok ? branch : `refs/remotes/origin/${scope.trunk}`;
}

/**
 * The ignored files a pack keeps: all but those an install or a build remakes, and none under a workspace.
 * None under a link either: on Windows git lists the files inside a junction as if they were the checkout's own.
 */
function keepable(hero: Hero, dir: string): string[] {
	const isSpared = spared(hero, dir);
	const linked = new Map<string, boolean>();
	const isLink = (path: string) => {
		if (!linked.has(path)) linked.set(path, lstatSync(join(dir, path)).isSymbolicLink());
		return linked.get(path)!;
	};
	const underLink = (file: string) => {
		const parts = file.split("/");
		return parts.slice(0, -1).some((_, i) => isLink(parts.slice(0, i + 1).join("/")));
	};
	return runGit(dir, "ls-files", "--others", "--ignored", "--exclude-standard")
		.text.split("\n")
		.filter((file) => file && !REBUILDABLE.test(file) && !isSpared(file) && !underLink(file));
}

/** Whether a path in a checkout lies under a workspace it holds, its repo's own or the hero's, which jump and pack never touch. */
function spared(hero: Hero, dir: string): (path: string) => boolean {
	const inside = [readRepoConfig(dir)?.workspace, hero.workspace].flatMap((workspace) => {
		if (!workspace) return [];
		const path = relative(dir, workspace).replace(/\\/g, "/");
		return path.startsWith("..") || isAbsolute(path) ? [] : [path ? `${path}/` : ""];
	});
	return (path) => inside.some((prefix) => path.startsWith(prefix));
}

function packsDir(hero: Hero): string {
	return join(hero.dir, ".nosedive", "local", "packs");
}

function read(dir: string, files: string[]): Record<string, Uint8Array> {
	return Object.fromEntries(files.map((file) => [file, new Uint8Array(readFileSync(join(dir, file)))]));
}

/** Zips a scope's keepable ignored files to its feat's pack, replacing it, or deleting it when there are none; returns how many. */
export function packIgnored(hero: Hero, featId: string, scope: { name: string; dir: string }): number {
	const path = join(packsDir(hero), featId, `${scope.name}.zip`);
	const files = existsSync(scope.dir) ? keepable(hero, scope.dir) : [];
	if (files.length === 0) {
		rmSync(path, { force: true });
		return 0;
	}
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, zipSync(read(scope.dir, files)));
	return files.length;
}

/**
 * Swaps a checkout's keepable ignored files for its feat's pack. Files the repo's newest pack does not match are
 * zipped to an orphan pack first, whose path it returns.
 */
export function swapIgnored(hero: Hero, featId: string, scope: { name: string; dir: string }): string | undefined {
	const files = keepable(hero, scope.dir);
	let orphaned: string | undefined;
	if (files.length > 0) {
		const current = read(scope.dir, files);
		const newest = newestPack(hero, scope.name);
		if (!newest || !same(current, unzipSync(new Uint8Array(readFileSync(newest))))) {
			orphaned = join(packsDir(hero), "orphans", `${scope.name}-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`);
			mkdirSync(dirname(orphaned), { recursive: true });
			writeFileSync(orphaned, zipSync(current));
		}
		for (const file of files) rmSync(join(scope.dir, file), { force: true });
	}
	const pack = join(packsDir(hero), featId, `${scope.name}.zip`);
	if (existsSync(pack)) {
		for (const [file, bytes] of Object.entries(unzipSync(new Uint8Array(readFileSync(pack))))) {
			mkdirSync(dirname(join(scope.dir, file)), { recursive: true });
			writeFileSync(join(scope.dir, file), bytes);
		}
	}
	return orphaned;
}

/** The most recently written pack of a repo, across feats. */
function newestPack(hero: Hero, name: string): string | undefined {
	const dir = packsDir(hero);
	if (!existsSync(dir)) return undefined;
	return readdirSync(dir)
		.filter((feat) => feat !== "orphans")
		.map((feat) => join(dir, feat, `${name}.zip`))
		.filter((path) => existsSync(path))
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

function same(a: Record<string, Uint8Array>, b: Record<string, Uint8Array>): boolean {
	const keys = Object.keys(a);
	return keys.length === Object.keys(b).length && keys.every((key) => b[key] !== undefined && Buffer.compare(a[key]!, b[key]!) === 0);
}

/** Whether the hero registers the doc as a repo (core's repo kind, by place). */
function isRepo(hero: Hero, id: string): boolean {
	const doc = heroDoc(hero, id);
	const kind = doc && docKind(doc);
	return kind?.owner === CORE_OWNER && kind.name === "repo";
}

/** The work scopes a feat or dive names: `- <repo>: { work-branch, ref }`, or a bare repo quid, read-only, of a repo the hero registers; any other entry is not work's to read. */
export function readScopes(hero: Hero, doc: Doc): ScopeEntry[] {
	const scopes = Array.isArray(doc.fm.scopes) ? doc.fm.scopes : [];
	return scopes.flatMap((entry): ScopeEntry[] => {
		if (typeof entry === "string") return isRepo(hero, entry) ? [{ repoId: entry }] : [];
		if (!entry || typeof entry !== "object") return [];
		return Object.entries(entry as Record<string, Record<string, unknown> | null>)
			.filter(([repoId]) => isRepo(hero, repoId))
			.map(([repoId, value]) => ({
				repoId,
				branch: typeof value?.["work-branch"] === "string" ? value["work-branch"] : undefined,
				ref: typeof value?.ref === "string" ? value.ref : undefined,
			}));
	});
}

/** The hero's dive ref as a dive last saw it, in its scope keyed by the hero's id. */
export function heroRef(hero: Hero, doc: Doc): string | undefined {
	const entries = Array.isArray(doc.fm.scopes) ? doc.fm.scopes : [];
	for (const entry of entries) {
		const value = entry && typeof entry === "object" ? (entry as Record<string, { ref?: unknown } | null>)[hero.id!] : undefined;
		if (typeof value?.ref === "string") return value.ref;
	}
	return undefined;
}

/** A dive's work scopes with each `ref` as given, keyed by repo id, the hero's included; one given none loses it. Every other entry is carried as parsed. */
export function scopesWith(hero: Hero, doc: Doc, refs: Map<string, string | undefined>): unknown[] {
	const scopes: unknown[] = readScopes(hero, doc).map((entry) => {
		const ref = refs.has(entry.repoId) ? refs.get(entry.repoId) : entry.ref;
		return { [entry.repoId]: { ...(entry.branch ? { "work-branch": entry.branch } : {}), ...(ref ? { ref } : {}) } };
	});
	const ref = refs.has(hero.id!) ? refs.get(hero.id!) : heroRef(hero, doc);
	if (ref) scopes.push({ [hero.id!]: { ref } });
	return [...scopes, ...otherScopes(hero, doc)];
}

/** The entries that are no work scope, which the work loop never rewrites: canonical and meta entries alike, bar the hero's own ref entry. */
function otherScopes(hero: Hero, doc: Doc): unknown[] {
	const scopes = Array.isArray(doc.fm.scopes) ? doc.fm.scopes : [];
	return scopes.filter((entry) => {
		if (typeof entry === "string") return !isRepo(hero, entry);
		if (!entry || typeof entry !== "object") return true;
		const keys = Object.keys(entry);
		if (keys.some((key) => isRepo(hero, key))) return false;
		const value = (entry as Record<string, Record<string, unknown> | null>)[keys[0]!];
		const heroRef = keys.length === 1 && keys[0] === hero.id && Object.keys(value ?? {}).every((key) => key === "ref");
		return !heroRef;
	});
}

/** A doc of the hero itself, in its bridge or any of its decks, never one of its workspace's repos. */
export function heroDoc(hero: Hero, id: string): Doc | undefined {
	const doc = locateKbDoc(hero, id);
	return doc?.repoDir === hero.dir ? doc : undefined;
}

/** The scope's repo doc, which the hero must register. */
export function repoDoc(hero: Hero, repoId: string): Doc {
	const repo = heroDoc(hero, repoId);
	const kind = repo && docKind(repo);
	if (!repo || kind?.owner !== CORE_OWNER || kind.name !== "repo") throw new Error(`${repoId} is no repo registered in the hero`);
	return repo;
}

/** The feat a dive was minted on. */
export function featOf(dive: Doc): string {
	return String((dive.fm.meta as { feat?: unknown } | undefined)?.feat);
}

/** A dive's open/held state. */
export function metaOf(dive: Doc): { diver?: string; packer?: string; outcome?: string } {
	const meta = (dive.fm.meta ?? {}) as Record<string, unknown>;
	const text = (value: unknown) => (typeof value === "string" ? value : undefined);
	return { diver: text(meta.diver), packer: text(meta.packer), outcome: text(meta.outcome) };
}

/** Every open dive: a doc of work's dive kind that core's feat-tree reaches, as its feat links it `dives.feat`, with no `meta.outcome`. */
export function openDives(hero: Hero): Doc[] {
	const walk = featWalk(hero);
	return [...walk.feats.keys()].flatMap((id) => {
		const doc = walk.docs.get(id);
		return doc && isDive(doc) && !metaOf(doc).outcome ? [doc] : [];
	});
}

/** The dive's first durable feat ancestor, its own feat when none is found. */
export function durableFeat(hero: Hero, dive: Doc, capes: Cape[]): string {
	const tree = featTree(hero);
	const queue = [featOf(dive)];
	const seen = new Set<string>();
	while (queue.length > 0) {
		const id = queue.shift()!;
		if (seen.has(id)) continue;
		seen.add(id);
		const doc = heroDoc(hero, id);
		if (doc) {
			const kind = docKind(doc);
			const spelling = kind.owner === hero.id ? kind.name : `${kind.owner}:${kind.name}`;
			if (isDurable(findKind(spelling, hero, capes))) return id;
		}
		queue.push(...(tree.get(id)?.parents ?? []));
	}
	return featOf(dive);
}

/** How a doc in the hero's kb is linked: its path from the hero's root, bridge/<id>.md in a seeded hero. */
export function keyOf(hero: Hero, doc: Doc): string {
	return relative(hero.dir, doc.path).replace(/\\/g, "/");
}

/** Hydration says only what it changed: a checkout already there is no news. */
export function quiet(ctx: Say) {
	return { out: (text: string) => (/checked out already$/.test(text) ? undefined : ctx.out(text)), err: ctx.err };
}

/** A dive's scopes with their checkouts, none hydrated or moved; a writable one is the dive's when on its dive branch. */
export function scopesOf(hero: Hero, doc: Doc, token: string): Scope[] {
	const id = String(doc.fm.id);
	return readScopes(hero, doc).map((entry): Scope => {
		const repo = repoDoc(hero, entry.repoId);
		const name = String(repo.fm.name);
		const dir = checkoutPath(hero, name);
		const there = existsSync(dir);
		const ours = there && (entry.branch ? runGit(dir, "symbolic-ref", "-q", "--short", "HEAD").text === diveBranch(token, id) : true);
		return { ...entry, repo, name, dir, trunk: trunkOf(repo, dir), ours };
	});
}

/**
 * The dive on deck: the one the hero's branch names, `nosedive-<token>-<dive id>` (dive-branches), open and held by that
 * token, with its home, the branch it was jumped from (loop-returns-home). Given a dive's quid, refuses any other.
 */
export function i01a15bb27be9786f91885a2f0a0fa08e(hero: Hero, _ctx: Say, id?: string): Dive {
	const branch = runGit(hero.dir, "symbolic-ref", "-q", "--short", "HEAD").text;
	const parsed = parseDiveBranch(branch);
	const doc = parsed && heroDoc(hero, parsed.diveId);
	if (!parsed || !doc || !isDive(doc)) throw new Error("the hero is on no dive branch, so no dive is on deck: `nosedive jump <feat or dive>` picks one up");
	const name = String(doc.fm.name);
	if (id && id !== parsed.diveId && id !== name) throw new Error(`the dive on deck is ${name} (${parsed.diveId}), not ${id}`);
	const { diver, outcome } = metaOf(doc);
	if (outcome) throw new Error(`dive ${name} is over: it ${outcome}`);
	if (diver?.split("#")[1] !== parsed.token) throw new Error(`dive ${name} is ${diver ? `held by ${diver.split("#")[0]}` : "held by nobody"} under another token than ${branch}'s, as a copied branch's would be`);
	const home = homeOf(hero, parsed.token);
	if (!home) throw new Error(`dive ${name}'s home, the branch it was jumped from, is gone: recreate it, as \`git branch <name> <commit>\``);
	return { hero, doc, feat: heroDoc(hero, featOf(doc)), scopes: scopesOf(hero, doc, parsed.token), branch, token: parsed.token, home };
}

/** Why each read-only scope holds work it cannot publish: commits origin lacks, or uncommitted changes. */
export function readOnlyRefusals(dive: Dive): string[] {
	return dive.scopes
		.filter((scope) => !scope.branch && scope.ours)
		.flatMap((scope) => {
			if (unpushed(scope.dir).length > 0) return [`${scope.name} is read-only, yet has commits origin lacks`];
			if (runGit(scope.dir, "status", "--porcelain").text) return [`${scope.name} is read-only, yet has uncommitted changes`];
			return [];
		});
}

/** One repo a dive's work is put down from: a writable scope's checkout, or the hero. */
export type Put = { key: string; name: string; dir: string; base: string; recorded: string | undefined; commits: string[]; sha?: string; head0?: string; tip?: string; dirty?: boolean };

/** The dive's refs in a repo's local refs, deleted once it is put down. */
export function localDiveRefs(dir: string, diveId: string): { ref: string; sha: string }[] {
	return runGit(dir, "for-each-ref", "--format=%(refname)%09%(objectname)", "refs/nosedive")
		.text.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [ref, sha] = line.split("\t") as [string, string];
			return { ref, sha };
		})
		.filter(({ ref }) => isDiveRef(ref, diveId));
}


/**
 * A record commit built off to the side on `parent`, which holds the dive doc as it is to be changed: no ref, index or file
 * is touched, and the commit is not on HEAD before it is published. `base` stands for a doc `parent` does not hold yet, and
 * `extra` carries other files in the same commit.
 */
export function recordOn(hero: Hero, parent: Sha, rel: string, change: Change, version: string, options: { base?: KbDoc; extra?: Record<string, string> } = {}): { tip: Sha; made: Set<Sha> } {
	const doc = options.base ?? docAt(hero.dir, parent, rel);
	if (!doc) throw new Error(`${rel} is no dive in the hero`);
	const { text, message } = recordDive(doc, change);
	return commitOffside(hero.dir, parent, { [rel]: text, ...options.extra }, message, version);
}

/** What a put-down hands its command's record: the repos put down, the ref each dive's work is kept on, and its name. */
export type PutDown = { puts: Put[]; refs: Map<string, string | undefined>; own: string };

/**
 * Puts a dive down, for pack and bail, as one plan: uncommitted work held in a commit off to the side, the home replayed,
 * the record built, every conflict found; then each scope and, last, the hero, one atomic push of the record, the dive's
 * ref and the deleted ones, and the local refs after it. The checkouts are left detached at their base and the hero on its
 * home, the dive branches gone, only once every push is done.
 */
export function putDown(dive: Dive, version: string, command: string, record: (done: PutDown) => Change): Promise<PutDown> {
	return replanning(() => putDownOnce(dive, version, command, record));
}

function putDownOnce(dive: Dive, version: string, command: string, record: (done: PutDown) => Change): PutDown {
	const { hero, home } = dive;
	const id = String(dive.doc.fm.id);
	const own = diveRef(hero, id);
	const up = homeUpstream(hero, home);
	// Fetched so every dive ref's commit is here: diveRefs orders them by commit time.
	const upstream = fetchHome(hero, up);
	// A home commit that is not nosedive's, or one that conflicts, is refused before anything is pushed (jump-publishes-nosedive-committed).
	const homePlan = planHome(hero, home, up, upstream);
	const writable = dive.scopes.filter((scope) => scope.branch && scope.ours);
	for (const scope of writable) fetchAll(scope.dir);
	const puts: Put[] = [
		...writable.map((scope): Put => ({ key: scope.repoId, name: scope.name, dir: scope.dir, base: baseOf(scope), recorded: scope.ref, commits: [] })),
		{ key: hero.id!, name: "hero", dir: hero.dir, base: `refs/heads/${home}`, recorded: heroRef(hero, dive.doc), commits: [] },
	];

	// Every lease is checked before anything is committed or pushed, against what the dive doc recorded at its last jump
	// or pack: local refs are no record, since any fetch into a repo's shared cache moves them. Each ref must hold the
	// recorded commit or older work of the dive; the dive's own ref may also hold a commit this checkout has, its own
	// earlier publish, so a retry goes on.
	const observed = new Map(puts.map((put) => [put.key, diveRefs(put.dir, id)]));
	const within = (dir: string, sha: string, tip: string | undefined) => tip !== undefined && runGit(dir, "merge-base", "--is-ancestor", sha, tip).ok;
	const moved = puts.flatMap((put) => {
		const current = observed.get(put.key)!;
		if (current.length === 0 && put.recorded !== undefined) return [`${put.name}: the dive's ref is gone, which this dive did not see`];
		return current.flatMap(({ ref, sha }) => {
			if (within(put.dir, sha, put.recorded) || (ref === own && within(put.dir, sha, "HEAD"))) return [];
			return [`${put.name}: ${ref} is at ${sha.slice(0, 7)}, which this dive did not see`];
		});
	});
	if (moved.length > 0) throw new Error(`the dive's refs moved under it, so nothing was put down:\n  ${moved.join("\n  ")}`);

	// Uncommitted work is held in a commit off to the side; the checkout and its index are untouched until the commit.
	for (const put of puts) {
		put.head0 = must(put.dir, "rev-parse", "HEAD");
		put.dirty = !!runGit(put.dir, "status", "--porcelain").text;
		put.tip = put.dirty ? snapshot(put.dir, put.head0, wip(dive.doc), version).tip : put.head0;
		put.commits = runGit(put.dir, "log", "--format=%h %s", `${put.base}..${put.tip}`).text.split("\n").filter(Boolean);
		if (put.commits.length > 0) put.sha = put.tip;
	}
	const done: PutDown = { puts, refs: new Map(puts.map((put) => [put.key, put.sha])), own };
	const made = recordOn(hero, homePlan.tip, keyOf(hero, dive.doc), record(done), version);

	const ignored = new Map(writable.map((scope) => {
		const isSpared = spared(hero, scope.dir);
		return [scope.repoId, runGit(scope.dir, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory").text.split("\n").filter((path) => path && !isSpared(path))];
	}));
	for (const scope of dive.scopes.filter((each) => each.ours)) packIgnored(hero, featOf(dive.doc), scope);

	const branch = `refs/heads/${dive.branch}`;
	const steps: Step[] = [];
	const after: Step[] = [];
	for (const put of puts) {
		const isHero = put.key === hero.id;
		const seen = observed.get(put.key)!;
		const updates: RemoteUpdate[] = [];
		if (isHero) updates.push(homeUpdate(homePlan, made.tip, [made.tip]));
		if (put.sha) {
			const there = seen.find(({ ref }) => ref === own);
			if (there?.sha !== put.sha) updates.push({ ref: own, old: there?.sha ?? null, new: put.sha, fastForward: false, publishes: diveWork(put.dir, put.sha, there?.sha ?? null) });
		}
		for (const { ref, sha } of put.sha ? seen.filter((each) => each.ref !== own) : seen) updates.push({ ref, old: sha, new: null, fastForward: false });
		const held = localDiveRefs(put.dir, id);
		const moves: LocalMove[] = held.map(({ ref, sha }) => ({ ref, old: sha, new: put.sha && ref === own ? put.sha : null }));
		if (put.sha && !held.some(({ ref }) => ref === own)) moves.push({ ref: own, old: null, new: put.sha });
		if (put.dirty) moves.push({ ref: branch, old: put.head0!, new: put.tip! });
		if (isHero) moves.push({ ref: `refs/heads/${home}`, old: homePlan.old, new: made.tip });
		// The index catches up with the held work, the tree untouched, so the files can then follow.
		steps.push({ repo: put.name, dir: put.dir, ...(updates.length > 0 ? { remote: { name: "origin", updates } } : {}), local: { moves, ...(put.dirty ? { files: { from: put.tip!, to: put.tip!, index: put.tip! } } : {}) } });
		const drop = [{ ref: branch, old: put.tip!, new: null }];
		if (isHero) after.push({ repo: put.name, dir: put.dir, local: { head: { from: { branch: dive.branch }, to: { branch: home } }, files: { from: put.tip!, to: made.tip }, drop } });
		else {
			const base = runGit(put.dir, "merge-base", put.tip!, put.base).text || must(put.dir, "rev-parse", put.base);
			after.push({ repo: put.name, dir: put.dir, local: { head: { from: { branch: dive.branch }, to: { detached: base } }, files: { from: put.tip!, to: base }, drop } });
		}
	}
	carry({ steps, after }, command);
	for (const scope of writable) {
		const paths = ignored.get(scope.repoId)!;
		// What the base does not ignore would read as untracked work; the feat's pack holds what is worth keeping.
		if (paths.length > 0) runGit(scope.dir, "clean", "-q", "-f", "-d", "--", ...paths);
	}
	return done;
}

/** What became of a turn's copy on the dive's home: pushed, kept there unpushed, or left on the dive branch alone. */
export type TurnOutcome = { kind: "pushed"; sha: string; to: string } | { kind: "unpushed"; why: string; to: string } | { kind: "dive-branch-only"; why: string };

/** The lines of git's complaint that say what went wrong, hints and the remote's name left out. */
function complaint(text: string): string {
	return text.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("hint:") && !line.startsWith("To ")).slice(0, 2).join("; ");
}

/**
 * Puts a turn's commit, which pass made on the dive branch, on the dive's home and pushes the home to its upstream
 * (turn-reaches-home-how): the home is not checked out, so its ref moves and no file does. Pushed with whatever a failed
 * turn left unpushed beneath it, nosedive's only, replayed onto the upstream as fetched. The push is leased on that fetch;
 * a lease that finds the remote moved plans again, three times. Refused while the home holds a commit its upstream lacks
 * that nosedive did not commit (jump-publishes-nosedive-committed). A conflict, or a home another worktree has checked out,
 * leaves the home as it was; a push that cannot be made leaves the turn on the home, unpushed.
 */
export function putTurnOnHome(hero: Hero, home: string, commit: string): TurnOutcome {
	const dir = hero.dir;
	const ref = `refs/heads/${home}`;
	if (runGit(dir, "worktree", "list", "--porcelain").text.split("\n").some((line) => line.trim() === `branch ${ref}`)) return { kind: "dive-branch-only", why: `${home} is checked out in another worktree, which a moved branch would leave confused` };
	const up = upstreamOf(hero, home);
	const to = up ? `${up.remote}/${up.name}` : home;
	const keep = (why: string): TurnOutcome => {
		const before = must(dir, "rev-parse", ref);
		const picked = replay(dir, [commit], before);
		if ("conflict" in picked) return { kind: "dive-branch-only", why: `it conflicts with ${home}: ${picked.conflict}` };
		const done = commitPlan({ steps: [{ repo: "hero", dir, local: { moves: [{ ref, old: before, new: picked.tip }] } }] }, "turn");
		return done.ok ? { kind: "unpushed", why, to } : { kind: "dive-branch-only", why: describeRefusal(done.refusal) };
	};
	if (!up) return keep(`${home} has no upstream`);
	let why = "";
	for (let tries = 0; tries < 3; tries++) {
		let upstream: Sha | null | undefined;
		try {
			upstream = fetchExact(dir, up.remote, [`refs/heads/${up.name}`])[`refs/heads/${up.name}`];
		} catch (error) {
			return keep(complaint((error as Error).message));
		}
		if (!upstream) return keep(`${to} is gone`);
		const before = must(dir, "rev-parse", ref);
		const ahead = ownedRange(dir, upstream, before);
		const others = ahead.filter((each) => !each.own);
		if (others.length > 0) return { kind: "dive-branch-only", why: `${home} holds ${others.length} commit${others.length === 1 ? "" : "s"} ${to} lacks that nosedive did not commit, which a push would publish: push or drop ${others.length === 1 ? "it" : "them"} first` };
		const replayed = replay(dir, [...ahead.map((each) => each.sha), commit], upstream);
		if ("conflict" in replayed) return { kind: "dive-branch-only", why: `it conflicts with ${home}: ${replayed.conflict}` };
		const step: Step = { repo: "hero", dir, remote: { name: up.remote, updates: [{ ref: `refs/heads/${up.name}`, old: upstream, new: replayed.tip, fastForward: true, publishes: replayed.made }] }, local: { moves: [{ ref, old: before, new: replayed.tip }] } };
		const done = commitPlan({ steps: [step] }, "turn");
		if (done.ok) return { kind: "pushed", sha: runGit(dir, "rev-parse", "--short", replayed.tip).text, to };
		why = done.refusal.detail;
		if (/is checked out in/.test(why)) return { kind: "dive-branch-only", why: `${home} is checked out in another worktree, which a moved branch would leave confused` };
		if (done.refusal.kind !== "stale") break;
	}
	return keep(complaint(why));
}
