import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
import type { Ctx } from "nosedive-core";
import { i01a1335480c776ba8945020d0af333eb as mintUuid } from "nosedive-core";

const root = mkdtempSync(join(tmpdir(), "nosedive-work-"));
after(() => rmSync(root, { recursive: true, force: true }));

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

/** A ship with a remote, registering one repo, `data`, that has a remote, and a feat its root links scoping it, writable unless `readOnly`. */
export function fixture(label: string, options: { readOnly?: boolean } = {}) {
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

	const shipRemote = join(dir, "ship.git");
	git(dir, "init", "-q", "--bare", "-b", "main", shipRemote);
	const ship = join(dir, "ship");
	git(dir, "clone", "-q", shipRemote, ship);
	identify(ship);
	const [shipId, repoId, featId] = [mintUuid(), mintUuid(), mintUuid()];
	mkdirSync(join(ship, ".nosedive"), { recursive: true });
	mkdirSync(join(ship, "kb"));
	writeFileSync(join(ship, ".nosedive", "config.yaml"), `kb: ./kb\nship: ${shipId}\n`);
	writeFileSync(join(ship, ".nosedive", ".gitignore"), "cache/\ncapes/\nlocal/\n");
	writeFileSync(join(ship, "kb", `${shipId}.md`), `---\nkind: ship\nid: ${shipId}\nname: ship\ngist: "A ship"\nmeta:\n  workspace: ./workspace\nlinks:\n  - kb/${featId}.md:\n      rel: work.feat\n---\n\n# ship\n`);
	writeFileSync(join(ship, "kb", `${repoId}.md`), `---\nkind: repo\nid: ${repoId}\nname: data\ngist: "Data"\nmeta:\n  trunk: main\n  remotes:\n    origin: ${JSON.stringify(remote)}\n---\n\n# data\n`);
	const scope = options.readOnly ? `  - ${repoId}\n` : `  - ${repoId}:\n      work-branch: work/ideas\n`;
	writeFileSync(join(ship, "kb", `${featId}.md`), `---\nkind: memo\nid: ${featId}\nname: ideas\ngist: "Ideas"\nscopes:\n${scope}---\n\n# Ideas\n`);
	mkdirSync(join(ship, "workspace"));
	writeFileSync(join(ship, "workspace", ".gitignore"), "*\n");
	git(ship, "add", "-A");
	git(ship, "commit", "-q", "-m", "seed");
	git(ship, "push", "-q", "-u", "origin", "HEAD:main");

	const out: string[] = [];
	const err: string[] = [];
	const ctx: Ctx = { cwd: ship, out: (text) => void out.push(text), err: (text) => void err.push(text), stdin: async () => "", capes: [] };
	const checkout = join(ship, "workspace", "data");
	return {
		ship,
		remote,
		featId,
		repoId,
		checkout,
		ctx,
		out,
		err,
		/** The dive on deck's id. */
		onDeck: () => readFileSync(join(ship, ".nosedive", "local", "dive"), "utf8").trim(),
		doc: (id: string) => readFileSync(join(ship, "kb", `${id}.md`), "utf8"),
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
