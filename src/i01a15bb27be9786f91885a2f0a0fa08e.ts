import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { i01a138b2b8ee703cab227b010f588b6a as locateKbDoc } from "nosedive-core";
import { i01a15baf13e27bd88dc880d4871f2210 as hydrateRepo } from "nosedive-core";
import type { Doc, Ship } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

const LOCAL = /^(?:[^:]*\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.md)?$/;

/** One repo a feat or dive works in: its work goes to `branch`, and a scope with none is read-only. */
export type ScopeEntry = { repoId: string; branch?: string; pin?: string };
export type Scope = ScopeEntry & { repo: Doc; name: string; dir: string; trunk: string; pin: string };
export type Dive = { ship: Ship; doc: Doc; feat: Doc | undefined; scopes: Scope[] };

/** Where a ship names the dive on deck. */
export function deckFile(ship: Ship): string {
	return join(ship.dir, ".nosedive", "local", "dive");
}

/** The id of the dive on deck, if any. */
export function onDeckId(ship: Ship): string | undefined {
	const deck = deckFile(ship);
	return (existsSync(deck) ? readFileSync(deck, "utf8").trim() : "") || undefined;
}

/** Who is diving: the ship's git user.email. */
export function diverOf(ship: Ship): string {
	const email = runGit(ship.dir, "config", "user.email").text;
	if (!email) throw new Error("git has no user.email here, and a dive is held by one: set it with `git config user.email`");
	return email;
}

/** Where a repo's remote keeps a dive's work until it lands. */
export function refOf(diveId: string): string {
	return `refs/nosedive/dives/${diveId}`;
}

/** The subject of the commit pack makes of uncommitted work, which jump undoes. */
export function wip(dive: Doc): string {
	return `pack(${String(dive.fm.name)}): work in progress`;
}

/** The scopes a feat or dive names: `- <repo>: { work-branch, pin }`, or a bare repo quid, read-only. */
export function readScopes(doc: Doc): ScopeEntry[] {
	const scopes = Array.isArray(doc.fm.scopes) ? doc.fm.scopes : [];
	return scopes.flatMap((entry): ScopeEntry[] => {
		if (typeof entry === "string") return [{ repoId: entry }];
		if (!entry || typeof entry !== "object") return [];
		return Object.entries(entry as Record<string, Record<string, unknown> | null>).map(([repoId, value]) => ({
			repoId,
			branch: typeof value?.["work-branch"] === "string" ? value["work-branch"] : undefined,
			pin: typeof value?.pin === "string" ? value.pin : undefined,
		}));
	});
}

/** A doc of the ship itself, in its bridge or any of its decks, never one of its workspace's repos. */
export function shipDoc(ship: Ship, id: string): Doc | undefined {
	const doc = locateKbDoc(ship, id);
	return doc?.repoDir === ship.dir ? doc : undefined;
}

/** The scope's repo doc, which the ship must register. */
export function repoDoc(ship: Ship, repoId: string): Doc {
	const repo = shipDoc(ship, repoId);
	if (repo?.fm.kind !== "repo") throw new Error(`${repoId} is no repo registered in the ship`);
	return repo;
}

export function i01a15bb27be9786f91885a2f0a0fa08e(ship: Ship, ctx: { out(text: string): void; err(text: string): void }, id?: string): Dive {
	const diveId = id ?? onDeckId(ship);
	if (!diveId) throw new Error("no dive is on deck: `nosedive jump <feat or dive>` picks one up");
	const doc = shipDoc(ship, diveId);
	if (doc?.fm.kind !== "dive") throw new Error(`${diveId} is no dive in the ship`);
	const featId = (doc.fm.meta as { feat?: unknown } | undefined)?.feat;
	const feat = typeof featId === "string" ? shipDoc(ship, featId) : undefined;
	const scopes = readScopes(doc).map((entry): Scope => {
		const repo = repoDoc(ship, entry.repoId);
		const { dir, trunk } = hydrateRepo(ship, repo, quiet(ctx));
		if (!entry.pin) throw new Error(`dive ${String(doc.fm.name)} has no pin for ${String(repo.fm.name)}`);
		return { ...entry, repo, name: String(repo.fm.name), dir, trunk, pin: entry.pin };
	});
	return { ship, doc, feat, scopes };
}

/** Why each read-only scope holds work it cannot publish: commits past its pin, or uncommitted changes. */
export function readOnlyRefusals(dive: Dive): string[] {
	return dive.scopes
		.filter((scope) => !scope.branch)
		.flatMap((scope) => {
			if (runGit(scope.dir, "rev-parse", "HEAD").text !== scope.pin) return [`${scope.name} is read-only, yet has commits past its pin`];
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

/** The deck whose root reaches a doc through links whose rel ends .feat, which is what makes it a feat. */
export function featDeck(ship: Ship, id: string): string | undefined {
	for (const deck of ship.decks) {
		const seen = new Set<string>();
		const queue = deck.root ? [deck.root] : [];
		while (queue.length > 0) {
			const at = queue.shift()!;
			if (seen.has(at)) continue;
			seen.add(at);
			const doc = shipDoc(ship, at);
			for (const link of doc ? linkedIds(doc) : []) {
				if (typeof link.rel !== "string" || !link.rel.endsWith(".feat") || link.rel === "parent.feat") continue;
				if (link.id === id) return deck.dir;
				queue.push(link.id);
			}
		}
	}
	return undefined;
}

/** How a doc in the ship's kb is linked: its path from the ship's root, bridge/<id>.md in a seeded ship. */
export function keyOf(ship: Ship, doc: Doc): string {
	return relative(ship.dir, doc.path).replace(/\\/g, "/");
}

/** Hydration says only what it changed: a checkout already there is no news. */
export function quiet(ctx: { out(text: string): void; err(text: string): void }) {
	return { out: (text: string) => (/checked out already$/.test(text) ? undefined : ctx.out(text)), err: ctx.err };
}
