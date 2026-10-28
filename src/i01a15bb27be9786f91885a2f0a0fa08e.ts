import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { unzipSync, zipSync } from "fflate";
import { i01a138b2b8ee703cab227b010f588b6a as locateKbDoc } from "nosedive-core";
import { i01a15baf13e27bd88dc880d4871f2210 as hydrateRepo } from "nosedive-core";
import type { Doc, Hero } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

const LOCAL = /^(?:[^:]*\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.md)?$/;
/** Ignored files an install or a build remakes, which packs leave out. */
const REBUILDABLE = /(^|\/)(node_modules|dist|build)\//;

/** One repo a feat or dive works in: its work goes to `branch`, and a scope with none is read-only. */
export type ScopeEntry = { repoId: string; branch?: string };
export type Scope = ScopeEntry & { repo: Doc; name: string; dir: string; trunk: string };
export type Dive = { hero: Hero; doc: Doc; feat: Doc | undefined; scopes: Scope[] };
type Say = { out(text: string): void; err(text: string): void };

/** Where a hero repo names the dive on deck. */
export function deckFile(hero: Hero): string {
	return join(hero.dir, ".nosedive", "local", "dive");
}

/** The id of the dive on deck, if any. */
export function onDeckId(hero: Hero): string | undefined {
	const deck = deckFile(hero);
	return (existsSync(deck) ? readFileSync(deck, "utf8").trim() : "") || undefined;
}

/** Who is diving: the hero's git user.email. */
export function diverOf(hero: Hero): string {
	const email = runGit(hero.dir, "config", "user.email").text;
	if (!email) throw new Error("git has no user.email here, and a dive is held by one: set it with `git config user.email`");
	return email;
}

/** The hero checkout's branch, which names a dive's local branch and its refs. */
export function heroBranch(hero: Hero): string {
	const on = runGit(hero.dir, "symbolic-ref", "-q", "--short", "HEAD");
	if (!on.ok) throw new Error("the hero is detached, so a dive's work has no branch to be named after: put the hero on a branch first");
	return on.text;
}

/** The dive's local branch in each writable scope, as core's hydrate-repo names a feat's. */
export function localBranch(hero: Hero, diveId: string): string {
	return `${hero.id}/${heroBranch(hero)}/${diveId}`;
}

/** Where pack keeps a dive's work on origin. */
export function diveRef(hero: Hero, diveId: string): string {
	return `refs/nosedive/dives/${localBranch(hero, diveId)}`;
}

/** The subject of the commit pack makes of uncommitted work, which jump undoes. */
export function wip(dive: Doc): string {
	return `pack(${String(dive.fm.name)}): work in progress`;
}

/** Every ref of the dive on origin, pushed from any hero, newest first. */
export function diveRefs(dir: string, diveId: string): { ref: string; sha: string }[] {
	return runGit(dir, "ls-remote", "origin", "refs/nosedive/dives/*")
		.text.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [sha, ref] = line.split("\t") as [string, string];
			return { ref, sha };
		})
		.filter(({ ref }) => ref.endsWith(`/${diveId}`))
		.sort((a, b) => Number(runGit(dir, "log", "-1", "--format=%ct", b.sha).text || 0) - Number(runGit(dir, "log", "-1", "--format=%ct", a.sha).text || 0));
}

/** Deletes refs on origin and their copies in the cache. */
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
	const ref = `refs/nosedive/orphans/${hero.id}/${heroBranch(hero)}/${runGit(dir, "rev-parse", "HEAD").text}`;
	const pushed = runGit(dir, "push", "-q", "origin", `HEAD:${ref}`);
	if (!pushed.ok) throw new Error(`cannot push ${dir}'s commits to ${ref}: ${pushed.text}`);
	runGit(dir, "update-ref", ref, "HEAD");
	return { ref, commits };
}

/** The repo's trunk: its `meta.trunk`, else the branch origin's HEAD named when last fetched. */
export function trunkOf(repo: Doc, dir: string): string {
	const trunk = (repo.fm.meta as { trunk?: unknown } | undefined)?.trunk;
	if (typeof trunk === "string") return trunk;
	return runGit(dir, "symbolic-ref", "-q", "--short", "refs/remotes/origin/HEAD").text.replace(/^origin\//, "") || "main";
}

/** The ignored files a pack keeps: all but those an install or a build remakes. */
function keepable(dir: string): string[] {
	return runGit(dir, "ls-files", "--others", "--ignored", "--exclude-standard")
		.text.split("\n")
		.filter((file) => file && !REBUILDABLE.test(file));
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
	const files = existsSync(scope.dir) ? keepable(scope.dir) : [];
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
	const files = keepable(scope.dir);
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

/** The scopes a feat or dive names: `- <repo>: { work-branch }`, or a bare repo quid, read-only. */
export function readScopes(doc: Doc): ScopeEntry[] {
	const scopes = Array.isArray(doc.fm.scopes) ? doc.fm.scopes : [];
	return scopes.flatMap((entry): ScopeEntry[] => {
		if (typeof entry === "string") return [{ repoId: entry }];
		if (!entry || typeof entry !== "object") return [];
		return Object.entries(entry as Record<string, Record<string, unknown> | null>).map(([repoId, value]) => ({
			repoId,
			branch: typeof value?.["work-branch"] === "string" ? value["work-branch"] : undefined,
		}));
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
	if (repo?.fm.kind !== "repo") throw new Error(`${repoId} is no repo registered in the hero`);
	return repo;
}

/** The feat a dive was minted on. */
export function featOf(dive: Doc): string {
	return String((dive.fm.meta as { feat?: unknown } | undefined)?.feat);
}

export function i01a15bb27be9786f91885a2f0a0fa08e(hero: Hero, ctx: Say, id?: string): Dive {
	const diveId = id ?? onDeckId(hero);
	if (!diveId) throw new Error("no dive is on deck: `nosedive jump <feat or dive>` picks one up");
	const doc = heroDoc(hero, diveId);
	if (doc?.fm.kind !== "dive") throw new Error(`${diveId} is no dive in the hero`);
	const feat = heroDoc(hero, featOf(doc));
	const scopes = readScopes(doc).map((entry): Scope => {
		const repo = repoDoc(hero, entry.repoId);
		const { dir, trunk } = hydrateRepo(hero, repo, quiet(ctx), entry.branch ? { id: diveId, workBranch: entry.branch } : undefined);
		return { ...entry, repo, name: String(repo.fm.name), dir, trunk };
	});
	return { hero, doc, feat, scopes };
}

/** Why each read-only scope holds work it cannot publish: commits origin lacks, or uncommitted changes. */
export function readOnlyRefusals(dive: Dive): string[] {
	return dive.scopes
		.filter((scope) => !scope.branch)
		.flatMap((scope) => {
			if (unpushed(scope.dir).length > 0) return [`${scope.name} is read-only, yet has commits origin lacks`];
			if (runGit(scope.dir, "status", "--porcelain").text) return [`${scope.name} is read-only, yet has uncommitted changes`];
			return [];
		});
}

/** The ids a doc links within its own repo, with each link's rel; a link naming another repo (<repo>:<id>) is left out. */
export function linkedIds(doc: Doc): { id: string; rel: unknown }[] {
	return (Array.isArray(doc.fm.links) ? doc.fm.links : []).flatMap((link) =>
		Object.entries((link ?? {}) as Record<string, { rel?: unknown } | null>).flatMap(([key, value]) => {
			const id = LOCAL.exec(key)?.[1];
			return id ? [{ id, rel: value?.rel }] : [];
		}),
	);
}

/**
 * The directory of the root that reaches a doc through links whose rel ends .feat, which is what makes it a feat;
 * a cape root's feats are its actions, not work.
 */
export function featRoot(hero: Hero, id: string): string | undefined {
	for (const root of hero.roots) {
		if (heroDoc(hero, root.id)?.fm.kind === "cape") continue;
		const seen = new Set<string>();
		const queue = [root.id];
		while (queue.length > 0) {
			const at = queue.shift()!;
			if (seen.has(at)) continue;
			seen.add(at);
			const doc = heroDoc(hero, at);
			for (const link of doc ? linkedIds(doc) : []) {
				if (typeof link.rel !== "string" || !link.rel.endsWith(".feat") || link.rel === "parent.feat") continue;
				if (link.id === id) return root.dir;
				queue.push(link.id);
			}
		}
	}
	return undefined;
}

/** How a doc in the hero's kb is linked: its path from the hero's root, bridge/<id>.md in a seeded hero. */
export function keyOf(hero: Hero, doc: Doc): string {
	return relative(hero.dir, doc.path).replace(/\\/g, "/");
}

/** Hydration says only what it changed: a checkout already there is no news. */
export function quiet(ctx: Say) {
	return { out: (text: string) => (/checked out already$/.test(text) ? undefined : ctx.out(text)), err: ctx.err };
}
