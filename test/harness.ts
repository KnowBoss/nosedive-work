import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
import type { Ctx } from "nosedive-core";
import { i01a1335480c776ba8945020d0af333eb as mintUuid } from "nosedive-core";

const root = mkdtempSync(join(tmpdir(), "nosedive-work-"));
after(() => rmSync(root, { recursive: true, force: true }));
// Core keeps repo caches in the user's dir; a test's go in its own.
process.env.NOSEDIVE_USER_DIR = mkdtempSync(join(root, "user-"));

export function tempDir(label: string): string {
	return mkdtempSync(join(root, `${label}-`));
}

export function git(cwd: string, ...args: string[]): string {
	const result = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (result.status !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	return result.stdout.trim();
}

function identify(dir: string): void {
	git(dir, "config", "user.name", "Work Test");
	git(dir, "config", "user.email", "diver@example.com");
}

/** A hero repo with a remote, registering one repo, `data`, that has a remote, and a feat its root links scoping it, writable unless `readOnly`. */
/**
 * A hero repo with one feat on repo `data`. By default an older hero, its root in kb named by its config;
 * `roots` makes it a repo by its config, the feat under a second root in ./docs, and the repo in .nosedive/repos.
 */
export function fixture(label: string, options: { readOnly?: boolean; roots?: boolean } = {}) {
	const dir = tempDir(label);
	const remote = join(dir, "data.git");
	git(dir, "init", "-q", "--bare", "-b", "main", remote);
	const seed = join(dir, "data-seed");
	git(dir, "clone", "-q", remote, seed);
	identify(seed);
	writeFileSync(join(seed, "README.md"), "data\n");
	git(seed, "add", "-A");
	git(seed, "commit", "-q", "-m", "first");
	git(seed, "push", "-q", "origin", "HEAD:refs/heads/main");

	const heroRemote = join(dir, "hero.git");
	git(dir, "init", "-q", "--bare", "-b", "main", heroRemote);
	const hero = join(dir, "hero");
	git(dir, "clone", "-q", heroRemote, hero);
	identify(hero);
	const [heroId, repoId, featId] = [mintUuid(), mintUuid(), mintUuid()];
	mkdirSync(join(hero, ".nosedive"), { recursive: true });
	mkdirSync(join(hero, "kb"));
	const docs = options.roots ? "docs" : "kb";
	const repos = options.roots ? join(".nosedive", "repos") : "kb";
	mkdirSync(join(hero, docs), { recursive: true });
	mkdirSync(join(hero, repos), { recursive: true });
	writeFileSync(join(hero, ".nosedive", ".gitignore"), "cache/\ncapes/\nlocal/\n");
	const feats = `links:\n  - ${docs}/${featId}.md:\n      rel: work.feat\n`;
	if (options.roots) {
		const [first, second] = [mintUuid(), mintUuid()];
		writeFileSync(join(hero, ".nosedive", "config.yaml"), `id: ${heroId}\nworkspace: ./workspace\nroots:\n  - kb/${first}.md\n  - docs/${second}.md\n`);
		writeFileSync(join(hero, "kb", `${first}.md`), `---\nkind: root\nid: ${first}\nname: kb\ngist: "The first root"\n---\n\n# kb\n`);
		writeFileSync(join(hero, "docs", `${second}.md`), `---\nkind: root\nid: ${second}\nname: docs\ngist: "The second root"\n${feats}---\n\n# docs\n`);
	} else {
		writeFileSync(join(hero, ".nosedive", "config.yaml"), `kb: ./kb\nship: ${heroId}\n`);
		writeFileSync(join(hero, "kb", `${heroId}.md`), `---\nkind: ship\nid: ${heroId}\nname: hero\ngist: "A hero repo"\nmeta:\n  workspace: ./workspace\n${feats}---\n\n# hero\n`);
	}
	writeFileSync(join(hero, repos, `${repoId}.md`), `---\nkind: repo\nid: ${repoId}\nname: data\ngist: "Data"\nmeta:\n  trunk: main\n  remotes:\n    origin: ${JSON.stringify(remote)}\n---\n\n# data\n`);
	const scope = options.readOnly ? `  - ${repoId}\n` : `  - ${repoId}:\n      work-branch: work/ideas\n`;
	writeFileSync(join(hero, docs, `${featId}.md`), `---\nkind: memo\nid: ${featId}\nname: ideas\ngist: "Ideas"\nscopes:\n${scope}---\n\n# Ideas\n`);
	mkdirSync(join(hero, "workspace"));
	writeFileSync(join(hero, "workspace", ".gitignore"), "*\n");
	git(hero, "add", "-A");
	git(hero, "commit", "-q", "-m", "seed");
	git(hero, "push", "-q", "-u", "origin", "HEAD:main");

	const out: string[] = [];
	const err: string[] = [];
	const ctx: Ctx = { cwd: hero, out: (text) => void out.push(text), err: (text) => void err.push(text), stdin: async () => "", capes: [] };
	const checkout = join(hero, "workspace", "data");
	return {
		hero,
		remote,
		featId,
		repoId,
		checkout,
		ctx,
		out,
		err,
		/** The dive on deck's id. */
		onDeck: () => readFileSync(join(hero, ".nosedive", "local", "dive"), "utf8").trim(),
		doc: (id: string) => readFileSync(join(hero, docs, `${id}.md`), "utf8"),
		/** Writes and commits a file in the data checkout. */
		commit(file: string, text: string): string {
			writeFileSync(join(checkout, file), text);
			git(checkout, "add", "-A");
			git(checkout, "commit", "-q", "-m", `add ${file}`);
			return git(checkout, "rev-parse", "HEAD");
		},
		remoteRef: (ref: string) => spawnSync("git", ["rev-parse", "--verify", "-q", ref], { cwd: remote, encoding: "utf8" }).stdout.trim(),
	};
}
