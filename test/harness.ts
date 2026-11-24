import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
import type { Ctx } from "nosedive-core";
import { i01a1335480c776ba8945020d0af333eb as mintUuid } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a1335482f876d6808aec457f512e80 as readKbDoc } from "nosedive-core";
import { i01a1335483aa776cb84df698b04adc06 as writeKbDoc } from "nosedive-core";
import { parseDiveBranch } from "../src/i01a15bb27be9786f91885a2f0a0fa08e.ts";

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

/**
 * A hero repo by its config, registering one repo, `data`, in .nosedive/repos, with a feat on it, writable unless
 * `readOnly`: under its one root in kb, or with `roots`, under a second root in ./docs.
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
	const [heroId, repoId, featId, memoKind] = [mintUuid(), mintUuid(), mintUuid(), mintUuid()];
	mkdirSync(join(hero, ".nosedive"), { recursive: true });
	mkdirSync(join(hero, "kb"));
	const docs = options.roots ? "docs" : "kb";
	const repos = join(".nosedive", "repos");
	mkdirSync(join(hero, docs), { recursive: true });
	mkdirSync(join(hero, repos), { recursive: true });
	mkdirSync(join(hero, ".nosedive", "kinds"));
	writeFileSync(join(hero, ".nosedive", "kinds", `${memoKind}.md`), `---\nkind: kind\nid: ${memoKind}\nname: memo\ngist: "A note"\n---\n\n# Memo\n\n## Drop when\n\nWhat it notes is done.\n`);
	writeFileSync(join(hero, ".nosedive", ".gitignore"), "cache/\ncapes/\nlocal/\n");
	const feats = `links:\n  - ${docs}/${featId}.md:\n      rel: work.feat\n`;
	if (options.roots) {
		const second = mintUuid();
		writeFileSync(join(hero, ".nosedive", "config.yaml"), `id: ${heroId}\nworkspace: ./workspace\nroots:\n  - kb/${heroId}.md\n  - docs/${second}.md\n`);
		writeFileSync(join(hero, "kb", `${heroId}.md`), `---\nkind: root\nid: ${heroId}\nname: kb\ngist: "The first root"\n---\n\n# kb\n`);
		writeFileSync(join(hero, "docs", `${second}.md`), `---\nkind: root\nid: ${second}\nname: docs\ngist: "The second root"\n${feats}---\n\n# docs\n`);
	} else {
		writeFileSync(join(hero, ".nosedive", "config.yaml"), `id: ${heroId}\nworkspace: ./workspace\nroots:\n  - kb/${heroId}.md\n`);
		writeFileSync(join(hero, "kb", `${heroId}.md`), `---\nkind: root\nid: ${heroId}\nname: hero\ngist: "A hero repo"\n${feats}---\n\n# hero\n`);
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
	const schemaVersion = git(seed, "rev-parse", "HEAD");
	const cape = (id: string, shortName: string, name: string, kinds: Record<string, unknown>, repoDir?: string) => ({ id, owner: id, shortName, name, repoDir, commit: schemaVersion, version: "test", docs: {}, index: {}, kinds });
	const capes = [cape("01a1336b-c0b8-7cde-b7c6-285196062297", "core", "core", {}), cape("01a15bb1-da9e-7d2d-aa82-5ee97257adc6", "work", "data", { dive: { id: "01a15bb2-5092-7858-90dd-e6c5b1b45254", version: schemaVersion, schema: { type: "object" } } }, seed)];
	const ctx: Ctx = { cwd: hero, out: (text) => void out.push(text), err: (text) => void err.push(text), stdin: async () => "", capes };
	const checkout = join(hero, "workspace", "data");
	return {
		hero,
		heroId,
		remote,
		featId,
		repoId,
		checkout,
		ctx,
		schemaVersion,
		schemaRepo: seed,
		out,
		err,
		/** The id of the dive on deck: the one the hero's dive branch names. */
		onDeck(cwd = hero): string {
			const parsed = parseDiveBranch(git(cwd, "symbolic-ref", "--short", "HEAD"));
			if (!parsed) throw new Error("the hero is on no dive branch");
			return parsed.diveId;
		},
		doc: (id: string) => readFileSync(join(hero, docs, `${id}.md`), "utf8"),
		/** Writes and commits a file in the data checkout. */
		commit(file: string, text: string): string {
			writeFileSync(join(checkout, file), text);
			git(checkout, "add", "-A");
			git(checkout, "commit", "-q", "-m", `add ${file}`);
			return git(checkout, "rev-parse", "HEAD");
		},
		remoteRef: (ref: string) => spawnSync("git", ["rev-parse", "--verify", "-q", ref], { cwd: remote, encoding: "utf8" }).stdout.trim(),
		/**
		 * Plans a dive on the feat as `crud work:dive <gist> --meta:feat <feat> --section:Brief -` would, dive-shape scoping, naming
		 * and linking it: committed on the hero's main and pushed. Returns its id.
		 */
		plan(gist = "Do the next part", unpushed = false, at = hero): string {
			const id = mintUuid();
			const repoScope = options.readOnly ? `  - ${repoId}: {}\n` : `  - ${repoId}:\n      work-branch: work/ideas\n`;
			const scopes = `scopes:\n  - 01a15bb1-da9e-7d2d-aa82-5ee97257adc6:\n      canonical: true\n${repoScope}`;
			writeFileSync(join(at, docs, `${id}.md`), `---\nkind: dive\nid: ${id}\nname: ideas.${id.slice(-6)}\ngist: "${gist}"\n${scopes}meta:\n  feat: ${featId}\n---\n\n# ${gist}\n\n## Brief\n\n${gist}.\n`);
			const featPath = join(at, docs, `${featId}.md`);
			const feat = readKbDoc(readFileSync(featPath, "utf8"));
			const links = Array.isArray(feat.fm.links) ? feat.fm.links : [];
			feat.yaml.set("links", [...links, { [`${docs}/${id}.md`]: { rel: "dives.feat" } }]);
			writeKbDoc(featPath, feat.yaml, feat.body);
			git(at, "add", "-A");
			// As crud commits it when unpushed: on this branch only, nosedive the committer.
			const env = unpushed ? { ...process.env, GIT_COMMITTER_NAME: "nosedive", GIT_COMMITTER_EMAIL: "noreply@nosedive.dev" } : process.env;
			const committed = spawnSync("git", ["commit", "-q", "-m", "plan a dive"], { cwd: at, env, encoding: "utf8" });
			if (committed.status !== 0) throw new Error(`plan's commit failed: ${committed.stderr}`);
			if (!unpushed) git(at, "push", "-q", "origin", "HEAD:main");
			return id;
		},
	};
}

/** The ids of `pass --turn`'s gate and the dive's shape, in work. */
const TURN = "01a18f45-42c6-70cc-b111-f6bd564e1f50";
const DIVE_SHAPE = "01a1b45b-04a0-79a4-94fe-d25a3665456d";

/** Runs the real turn gate through the launcher on a jumped fixture; `plain` is the ctx for the loop's own actions (pack, land, bail). */
export async function turner(f: ReturnType<typeof fixture>) {
    const core = await import("nosedive-core");
    const { i01a18f4542c670ccb111f6bd564e1f50: turn } = await import("../src/i01a18f4542c670ccb111f6bd564e1f50.ts");
    const { i01a1b45b04a079a494fed25a3665456d: diveShape } = await import("../src/i01a1b45b04a079a494fed25a3665456d.ts");
    const { dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const source = core.i01a1335487e477549d84a6fc2c901bf6(dirname(dirname(fileURLToPath(import.meta.url))));
    const plain = { ...f.ctx };
    const work = f.ctx.capes[1]!;
    const dive = work.kinds.dive as Record<string, unknown>;
    const declared = source.kinds.dive as Record<string, unknown>;
    const ns = core.i01a1335480147d0686528aee80f8ee34;
    const cape = { ...work, docs: source.docs, index: { [ns(TURN, work.id)]: turn, [ns(DIVE_SHAPE, work.id)]: diveShape }, kinds: { ...work.kinds, dive: { ...dive, links: declared.links } } };
    const turning: Ctx = { ...f.ctx, capes: [core as never, cape as never] };
    const id = f.onDeck();
    return {
        plain,
        id,
        /** One turn on the dive branch, under its own heading label; returns the commit. */
        async turn(summary: string, label: string): Promise<string> {
            const code = await core.i01a1336a958f71c7beec4db3195c7966(["pass", "--turn", id, summary, "--label", label], turning);
            if (code !== 0) throw new Error(`pass --turn failed: ${f.err.join("\n")}`);
            return git(f.hero, "rev-parse", "HEAD");
        },
    };
}

/** Pushes to the hero's origin main as another checkout would: `edit` works in a scratch clone of it, which is pushed after. */
export function onOrigin(f: ReturnType<typeof fixture>, edit: (clone: string) => void): void {
    const clone = join(tempDir("origin-clone"), "clone");
    git(f.hero, "clone", "-q", git(f.hero, "remote", "get-url", "origin"), clone);
    identify(clone);
    edit(clone);
    git(clone, "push", "-q", "origin", "HEAD:main");
}
