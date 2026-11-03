import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import { unzipSync, zipSync } from "fflate";
import type { Cape } from "nosedive-core";
import { i01a138b2b8ee703cab227b010f588b6a as locateKbDoc } from "nosedive-core";
import { i01a13c760de87562b4738946402010b8 as checkoutPath } from "nosedive-core";
import { i01a13dee4b1d78f7a699c3777bf63587 as readRepoConfig } from "nosedive-core";
import { i01a147171f057d019118aaa1f269f5fd as findKind, isDurable } from "nosedive-core";
import { i01a18e2a3b4b798d98068d4778a158e6 as docKind } from "nosedive-core";
import { CORE_OWNER, holderToken, subjectLine, hasCoAuthor, isCoAuthor, featTree, openDives as coreOpenDives } from "nosedive-core";
import { i01a19005c31172b68871d4842563d310 as commitMessage } from "nosedive-core";
import type { Doc, Hero } from "./i01a15bb27d7c72258e54d02070189892.ts";
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
export type Dive = { hero: Hero; doc: Doc; feat: Doc | undefined; scopes: Scope[] };
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

/** Who holds a dive from this checkout of the hero: `<email>#<holder token>`, which core's commit-subject reads to find the held dive's feat. */
export function holderOf(hero: Hero): string {
	emailOf(hero);
	heroBranch(hero);
	return holderToken(hero.dir)!;
}

/** The hero's trunk: the branch origin's HEAD named when last fetched. */
export function heroTrunk(hero: Hero): string {
	return runGit(hero.dir, "symbolic-ref", "-q", "--short", "refs/remotes/origin/HEAD").text.replace(/^origin\//, "") || "main";
}

/** Fetches a repo's branches and nosedive refs from origin. */
export function fetchAll(dir: string): void {
	runGit(dir, "fetch", "-q", "--prune", "origin", "+refs/heads/*:refs/remotes/origin/*", "+refs/nosedive/*:refs/nosedive/*");
}

/** The dive's local branch in each writable scope, as core's hydrate-repo names a feat's. */
export function localBranch(hero: Hero, diveId: string): string {
	return `${hero.id}/${heroBranch(hero)}/${diveId}`;
}

/** Where a dive's work is kept on each repo's origin, whichever checkout of the hero packs it. */
export function diveRef(hero: Hero, diveId: string): string {
	return `refs/nosedive/${hero.id}/dives/${diveId}`;
}

/** The subject of the commit pack makes of uncommitted work, which jump undoes. */
export function wip(hero: Hero, dive: Doc): string {
	return subjectLine(featName(hero, dive), "pack", `work in progress on ${String(dive.fm.name)}`);
}

/** Whether a commit's subject is this dive's work in progress, as pack names it now, whatever the feat's name, or named it before feats grouped commits; another dive's is not. */
export function isWip(dive: Doc, subject: string): boolean {
	const name = String(dive.fm.name);
	return subject === `pack(${name}): work in progress` || /^(?:feat\([^)]*\): pack |pack: )work in progress on (.*)$/.exec(subject)?.[1] === name;
}

/** The name of a dive's feat, which groups the commits of its loop; nothing when the hero does not hold the feat. */
export function featName(hero: Hero, dive: Doc): string | undefined {
	const name = heroDoc(hero, featOf(dive))?.fm.name;
	return name === undefined ? undefined : String(name);
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

/** Deletes refs on origin and their copies here. */
export function deleteRefs(dir: string, refs: string[]): void {
	for (const ref of refs) {
		runGit(dir, "push", "-q", "origin", `:${ref}`);
		runGit(dir, "update-ref", "-d", ref);
	}
}

/** The commits HEAD holds that no branch or nosedive ref on origin does, as last fetched, by sha and subject. */
export function unpushed(dir: string): string[] {
	return runGit(dir, "log", "--format=%h %s", "HEAD", "--not", "--remotes=origin", "--glob=refs/nosedive/*").text.split("\n").filter(Boolean);
}

/** Pushes HEAD to an orphan ref when it holds commits no ref on origin does, so moving off it loses nothing. */
export function orphan(hero: Hero, dir: string): { ref: string; commits: string[] } | undefined {
	const commits = unpushed(dir);
	if (commits.length === 0) return undefined;
	const ref = `refs/nosedive/${hero.id}/orphans/${runGit(dir, "rev-parse", "HEAD").text}`;
	const pushed = runGit(dir, "push", "-q", "origin", `HEAD:${ref}`);
	if (!pushed.ok) throw new Error(`cannot push ${dir}'s commits to ${ref}: ${pushed.text}`);
	runGit(dir, "update-ref", ref, "HEAD");
	return { ref, commits };
}

/** The repo's trunk: its `meta.trunk`, else the branch origin's HEAD named when last fetched. */
export function trunkOf(repo: Doc, dir: string): string {
	const trunk = (repo.fm.meta as { trunk?: unknown } | undefined)?.trunk;
	if (typeof trunk === "string") return trunk;
	return (existsSync(dir) && runGit(dir, "symbolic-ref", "-q", "--short", "refs/remotes/origin/HEAD").text.replace(/^origin\//, "")) || "main";
}

/** Where a scope's work starts: its work branch on origin when there is one, else trunk. */
export function baseOf(scope: { dir: string; branch?: string; trunk: string }): string {
	const branch = `refs/remotes/origin/${scope.branch}`;
	return scope.branch && runGit(scope.dir, "rev-parse", "--verify", "-q", branch).ok ? branch : `refs/remotes/origin/${scope.trunk}`;
}

/**
 * Pushes the commits on one side of `range` that lack them through new commits, each with the same tree, author and
 * committer, its message given the trailers; plumbing, so no hook runs. Moves HEAD to the last; returns how many.
 */
export function stamp(dir: string, range: string[], trailers: string[]): number {
	const shas = runGit(dir, "rev-list", "--reverse", "--topo-order", ...range).text.split("\n").filter(Boolean);
	const made = new Map<string, string>();
	for (const sha of shas) {
		const [an, ae, ad, cn, ce, cd, parents, tree] = runGit(dir, "log", "-1", "--format=%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%P%x00%T", sha).text.split("\0") as string[];
		const message = spawnSync("git", ["log", "-1", "--format=%B", sha], { cwd: dir, encoding: "utf8" }).stdout;
		// A trailer already there is left alone, except that a co-author is told by its value: another's does not stand in for nosedive's.
		const given = trailers.flatMap((trailer) => (isCoAuthor(trailer) ? (hasCoAuthor(message) ? [] : ["--if-exists", "add", "--trailer", trailer]) : ["--if-exists", "doNothing", "--trailer", trailer]));
		const args = ["interpret-trailers", ...given];
		const stamped = spawnSync("git", args, { cwd: dir, encoding: "utf8", input: message }).stdout;
		const env = { ...process.env, GIT_AUTHOR_NAME: an, GIT_AUTHOR_EMAIL: ae, GIT_AUTHOR_DATE: ad, GIT_COMMITTER_NAME: cn, GIT_COMMITTER_EMAIL: ce, GIT_COMMITTER_DATE: cd };
		const parentArgs = (parents ?? "").split(" ").filter(Boolean).flatMap((parent) => ["-p", made.get(parent) ?? parent]);
		const result = spawnSync("git", ["commit-tree", tree!, ...parentArgs], { cwd: dir, encoding: "utf8", input: stamped, env });
		if (result.status !== 0) throw new Error(`cannot stamp ${sha.slice(0, 7)} in ${dir}: ${result.stderr.trim()}`);
		made.set(sha, result.stdout.trim());
	}
	const last = shas.at(-1);
	if (last) runGit(dir, "update-ref", "HEAD", made.get(last)!);
	return shas.length;
}

/** The ignored files a pack keeps: all but those an install or a build remakes, and none under a workspace. */
function keepable(hero: Hero, dir: string): string[] {
	const isSpared = spared(hero, dir);
	return runGit(dir, "ls-files", "--others", "--ignored", "--exclude-standard")
		.text.split("\n")
		.filter((file) => file && !REBUILDABLE.test(file) && !isSpared(file));
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

/** Every dive of work's kind that core's feat-tree finds open. */
export function openDives(hero: Hero): Doc[] {
	return coreOpenDives(hero).filter(isDive);
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

/** A dive's scopes with their checkouts, none hydrated or moved. */
export function scopesOf(hero: Hero, doc: Doc): Scope[] {
	const id = String(doc.fm.id);
	return readScopes(hero, doc).map((entry): Scope => {
		const repo = repoDoc(hero, entry.repoId);
		const name = String(repo.fm.name);
		const dir = checkoutPath(hero, name);
		const there = existsSync(dir);
		const ours = there && (entry.branch ? runGit(dir, "symbolic-ref", "-q", "--short", "HEAD").text === localBranch(hero, id) : true);
		return { ...entry, repo, name, dir, trunk: trunkOf(repo, dir), ours };
	});
}

/** One line per scope of a dive: whether its checkout is the dive's, and how many commits it holds origin lacks. */
function stateOf(hero: Hero, doc: Doc): string {
	const parts = scopesOf(hero, doc).map((scope) => (scope.ours ? `${scope.name} on its branch, ${unpushed(scope.dir).length} commits origin lacks` : `${scope.name} not checked out for it`));
	return `${String(doc.fm.name)} (${String(doc.fm.id)}): ${parts.join("; ") || "no scopes"}`;
}

export function i01a15bb27be9786f91885a2f0a0fa08e(hero: Hero, _ctx: Say, id?: string): Dive {
	const holder = holderOf(hero);
	const held = openDives(hero).filter((doc) => metaOf(doc).diver === holder);
	let doc: Doc | undefined;
	if (id) {
		doc = held.find((each) => each.fm.id === id);
		if (!doc) throw new Error(`this checkout of the hero holds no dive ${id}`);
	} else if (held.length === 0) {
		throw new Error("this checkout of the hero holds no dive: `nosedive jump <feat or dive>` picks one up");
	} else if (held.length > 1) {
		throw new Error(`this checkout of the hero holds ${held.length} dives, so name one:\n  ${held.map((each) => stateOf(hero, each)).join("\n  ")}`);
	} else {
		doc = held[0]!;
	}
	return { hero, doc, feat: heroDoc(hero, featOf(doc)), scopes: scopesOf(hero, doc) };
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
type Put = { key: string; name: string; dir: string; base: string; recorded: string | undefined; commits: string[]; sha?: string };

/**
 * Puts a dive down, for pack and bail: uncommitted work committed, each repo's work pushed to the dive's ref with a
 * lease against what the dive last saw, checkouts left detached at their base, the hero reset to trunk. Returns each
 * repo's commits and the ref values to record.
 */
export function putDown(dive: Dive, version: string): { puts: Put[]; refs: Map<string, string | undefined>; own: string } {
	const { hero } = dive;
	const id = String(dive.doc.fm.id);
	const own = diveRef(hero, id);
	const trunk = heroTrunk(hero);
	runGit(hero.dir, "fetch", "-q", "--prune", "origin", `+refs/heads/${trunk}:refs/remotes/origin/${trunk}`, "+refs/nosedive/*:refs/nosedive/*");
	const writable = dive.scopes.filter((scope) => scope.branch && scope.ours);
	for (const scope of writable) fetchAll(scope.dir);
	const puts: Put[] = [
		...writable.map((scope): Put => ({ key: scope.repoId, name: scope.name, dir: scope.dir, base: baseOf(scope), recorded: scope.ref, commits: [] })),
		{ key: hero.id!, name: "hero", dir: hero.dir, base: `refs/remotes/origin/${trunk}`, recorded: heroRef(hero, dive.doc), commits: [] },
	];

	// Every lease is checked before anything is committed or pushed.
	const observed = new Map(puts.map((put) => [put.key, diveRefs(put.dir, id)]));
	const moved = puts.flatMap((put) => {
		const newest = observed.get(put.key)![0];
		return newest?.sha === put.recorded ? [] : [`${put.name}: ${newest ? `${newest.ref} is at ${newest.sha.slice(0, 7)}` : "the dive's ref is gone"}, which this dive did not see`];
	});
	if (moved.length > 0) throw new Error(`the dive's refs moved under it, so nothing was put down:\n  ${moved.join("\n  ")}`);

	for (const put of puts) {
		if (runGit(put.dir, "status", "--porcelain").text) {
			runGit(put.dir, "add", "-A");
			const committed = runGit(put.dir, "commit", "-q", "-m", commitMessage(wip(hero, dive.doc), version));
			if (!committed.ok) throw new Error(`cannot commit ${put.name}'s uncommitted work: ${committed.text}`);
		}
		put.commits = runGit(put.dir, "log", "--format=%h %s", put.base + "..HEAD").text.split("\n").filter(Boolean);
		const refs = observed.get(put.key)!;
		const leases = refs.flatMap(({ ref, sha }) => [`--force-with-lease=${ref}:${sha}`, ...(ref === own && put.commits.length > 0 ? [] : [`:${ref}`])]);
		if (put.commits.length > 0) {
			if (!refs.some(({ ref }) => ref === own)) leases.push(`--force-with-lease=${own}:`);
			leases.push(`HEAD:${own}`);
		}
		if (leases.length > 0) {
			const pushed = runGit(put.dir, "push", "-q", "--atomic", "origin", ...leases);
			if (!pushed.ok) throw new Error(`cannot push ${put.name}'s work to ${own}: ${pushed.text}`);
		}
		for (const { ref } of refs) if (ref !== own) runGit(put.dir, "update-ref", "-d", ref);
		if (put.commits.length > 0) {
			put.sha = runGit(put.dir, "rev-parse", "HEAD").text;
			runGit(put.dir, "update-ref", own, put.sha);
		} else runGit(put.dir, "update-ref", "-d", own);
	}

	for (const scope of dive.scopes.filter((each) => each.ours)) packIgnored(hero, featOf(dive.doc), scope);
	for (const scope of writable) {
		const base = runGit(scope.dir, "merge-base", "HEAD", baseOf(scope)).text || baseOf(scope);
		const isSpared = spared(hero, scope.dir);
		const ignored = runGit(scope.dir, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory").text.split("\n").filter((path) => path && !isSpared(path));
		runGit(scope.dir, "checkout", "-q", "--detach", base);
		// What the base does not ignore would read as untracked work; the feat's pack holds what is worth keeping.
		if (ignored.length > 0) runGit(scope.dir, "clean", "-q", "-f", "-d", "--", ...ignored);
		runGit(scope.dir, "branch", "-q", "-D", localBranch(hero, id));
	}
	runGit(hero.dir, "reset", "-q", "--hard", `refs/remotes/origin/${trunk}`);
	return { puts, refs: new Map(puts.map((put) => [put.key, put.sha])), own };
}

/**
 * Commits a record on top of the hero's branch with `record` and pushes it to trunk; when trunk moved meanwhile, it
 * drops the record, rebases onto the new tip and records again.
 */
export function pushTrunk(hero: Hero, record: () => void): void {
	const trunk = heroTrunk(hero);
	for (let tries = 0; ; tries++) {
		record();
		const pushed = runGit(hero.dir, "push", "-q", "origin", `HEAD:refs/heads/${trunk}`);
		if (pushed.ok) {
			runGit(hero.dir, "update-ref", `refs/remotes/origin/${trunk}`, "HEAD");
			return;
		}
		runGit(hero.dir, "reset", "-q", "--hard", "HEAD^");
		if (tries === 2) throw new Error(`cannot push the hero's record to ${trunk}: ${pushed.text}`);
		runGit(hero.dir, "fetch", "-q", "origin", `+refs/heads/${trunk}:refs/remotes/origin/${trunk}`);
		const rebased = runGit(hero.dir, "rebase", "-q", `refs/remotes/origin/${trunk}`);
		if (!rebased.ok) {
			runGit(hero.dir, "rebase", "--abort");
			throw new Error(`the hero's work conflicts with ${trunk} as it moved: ${rebased.text}`);
		}
	}
}
