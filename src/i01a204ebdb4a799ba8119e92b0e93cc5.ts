import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { i01a13c760de87562b4738946402010b8 as checkoutPath } from "nosedive-core";
import { diveRefs, readScopes, repoDoc } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import type { Doc, Hero } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as git } from "./i01a15bb27f1471549b097c2e37805132.ts";

const clean = (path: string) => path.replace(/\/+$/, "").replace(/\.git$/, "");

/** A repository identity, ignoring transport and login where they name the same host and path. */
export function normalizedOrigin(url: string, dir: string): string | undefined {
	if (!url || url.includes("::")) return undefined;
	try {
		if (/^file:\/\//i.test(url)) url = fileURLToPath(url);
		else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
			const parsed = new URL(url);
			if (!/^(https?|ssh|git):$/.test(parsed.protocol) || !parsed.hostname || parsed.search || parsed.hash) return undefined;
			const port = parsed.port === "22" && parsed.protocol === "ssh:" ? "" : parsed.port;
			return `net:${parsed.hostname.toLowerCase()}${port ? `:${port}` : ""}/${clean(decodeURIComponent(parsed.pathname).replace(/^\/+/, ""))}`;
		} else if (!isAbsolute(url) && !/^[a-z]:[\\/]/i.test(url)) {
			const scp = /^(?:[^@/\\\s]+@)?([^:/\\\s]+):(.+)$/.exec(url);
			if (scp) return `net:${scp[1]!.toLowerCase()}/${clean(scp[2]!.replace(/^\/+/, ""))}`;
			if (url.includes(":")) return undefined;
		}
		let path = resolve(dir, url);
		try { path = realpathSync(path); } catch {}
		path = clean(path.replace(/\\/g, "/"));
		return `file:${process.platform === "win32" ? path.toLowerCase() : path}`;
	} catch {
		return undefined;
	}
}

/** Git expands insteadOf and pushInsteadOf, and can name more than one push destination. */
export function originUrls(dir: string): string[] | undefined {
	const read = git(dir, "remote", "get-url", "--all", "origin");
	const push = git(dir, "remote", "get-url", "--push", "--all", "origin");
	return read.ok && push.ok && read.text && push.text ? [...new Set(`${read.text}\n${push.text}`.split(/\r?\n/))] : undefined;
}

/** What the hero's Git makes of a URL a repo doc declares, which hydrate would clone and push to: through insteadOf, and through the longest matching pushInsteadOf. */
function declaredUrls(hero: string, url: string): string[] | undefined {
	const read = git(hero, "ls-remote", "--get-url", url);
	if (!read.ok || !read.text) return undefined;
	const rules = git(hero, "config", "--get-regexp", "^url\\..*\\.pushinsteadof$");
	const pushes = (rules.ok ? rules.text.split(/\r?\n/) : []).flatMap((line) => {
		const match = /^url\.(.*)\.pushinsteadof (.*)$/i.exec(line);
		return match && url.startsWith(match[2]!) ? [{ base: match[1]!, prefix: match[2]! }] : [];
	});
	const longest = pushes.sort((a, b) => b.prefix.length - a.prefix.length)[0];
	return [...new Set([read.text, ...(longest ? [longest.base + url.slice(longest.prefix.length)] : [])])];
}

/** The origin URLs of the hero and of a scope, and whether the scope is separate: only if both are known and disjoint. Before hydration Git reads the repo doc's origin. */
function compareOrigins(hero: string, dir: string | undefined, declared: unknown): { own: boolean; hero?: string[]; scope?: string[] } {
	const there = dir === undefined ? undefined : git(dir, "rev-parse", "--show-prefix");
	const present = there?.ok && there.text === "";
	const url = typeof declared === "string" && declared ? declared : undefined;
	const configured = url && (/^[^/\\]*:/.test(url) || isAbsolute(url) ? url : resolve(hero, url));
	const scope = present ? originUrls(dir!) : configured ? declaredUrls(hero, configured) : undefined;
	const ours = originUrls(hero);
	const a = ours?.map((url) => normalizedOrigin(url, hero));
	const b = scope?.map((url) => normalizedOrigin(url, present ? dir! : hero));
	return { own: !a || !b || a.includes(undefined) || b.includes(undefined) || a.some((url) => b.includes(url)), hero: ours, scope };
}

export function isOwnOrigin(hero: string, dir: string | undefined, declared: unknown): boolean {
	return compareOrigins(hero, dir, declared).own;
}

/**
 * Why each writable scope of a feat or dive is refused: its origin is the hero's own, or cannot be shown different, so its work
 * could reach the hero's main as hero work (own-scope-publishes-nothing-unmerged). Names the dive's refs on those origins.
 */
export function ownScopes(hero: Hero, doc: Doc): string[] {
	return readScopes(hero, doc).filter((entry) => entry.branch).flatMap((entry) => {
		const repo = repoDoc(hero, entry.repoId);
		const name = String(repo.fm.name);
		const dir = checkoutPath(hero, name);
		const declared = (repo.fm.meta as { remotes?: { origin?: unknown } } | undefined)?.remotes?.origin;
		const found = compareOrigins(hero.dir, existsSync(dir) ? dir : undefined, declared);
		if (!found.own) return [];
		const shown = (urls?: string[]) => (urls ? urls.join(", ") : "unreadable");
		const refs = new Map([hero.dir, dir].filter((where) => existsSync(where)).flatMap((where) => diveRefs(where, String(doc.fm.id))).map((tip) => [`${tip.ref} ${tip.sha}`, tip] as const));
		const held = [...refs.values()].map(({ ref, sha }) => `\n    ${ref} is at ${sha}: compare it with ${entry.branch} by hand, then bail the dive, which leaves it as it is`);
		return [`${name} works ${entry.branch} on origin ${shown(found.scope)}, which is the hero's own (${shown(found.hero)}) or cannot be shown different, so its work could reach the hero's main as the hero's: give ${name} its own repo, or drop its work branch${held.join("")}`];
	});
}

/** Refuses a feat or dive with such a scope, before anything is written. */
export function refuseOwnScopes(hero: Hero, doc: Doc): void {
	const refused = ownScopes(hero, doc);
	if (refused.length > 0) throw new Error(`nothing was changed:\n  ${refused.join("\n  ")}`);
}
