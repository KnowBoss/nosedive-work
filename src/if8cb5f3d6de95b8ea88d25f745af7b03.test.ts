// jump [<ref>]
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { i0735c57383365d4ca5395ea24f5b0649 as pack } from "./i0735c57383365d4ca5395ea24f5b0649.ts";
import { i2bcf8d7ee2645df5b261ee1b2135d190 as land } from "./i2bcf8d7ee2645df5b261ee1b2135d190.ts";
import { iffc777778a63553ba90babcc038eb748 as bail } from "./iffc777778a63553ba90babcc038eb748.ts";
import { i01a1335480c776ba8945020d0af333eb as mintUuid } from "nosedive-core";
import { i01a13354894273b1be253424511ba82c as commitFiles } from "nosedive-core";
import { fixture, git, tempDir } from "../test/harness.ts";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { diveBranch, putTurnOnHome, tokenOf } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";

/** The dive branch a dive jumped from the hero's main has. */
const branchOf = (f: ReturnType<typeof fixture>, id: string) => diveBranch(tokenOf(findBridge(f.hero)!, "main"), id);
/** What jump ends with, naming the dive's brief (jump-starts-the-work). */
const nudge = (brief: string) => `Now do the dive's work, from its brief, ${brief}, to its feat's Done when; pack or land it only when the pilot asks.`;

test("a feat the root reaches gets a dive with its scopes, naming the feat and linked from it as dives.feat, the hero and its scope on its dive branch, held by this checkout, its bookkeeping on the home it was jumped from", async () => {
	const f = fixture("jump-feat");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const dive = f.doc(id);
	const trunk = git(f.remote, "rev-parse", "main");
	assert.match(dive, new RegExp(`^---\\nkind: dive\\nid: ${id}\\nname: ${id.slice(-6)}\\.ideas\\n`));
	assert.match(dive, new RegExp(`scopes:\\n {2}- ${f.repoId}:\\n {6}work-branch: work/ideas\\n`));
	assert.match(dive, new RegExp(`\\nmeta:\\n {2}feat: ${f.featId}\\n {2}diver: diver@example\\.com#[0-9a-f]{12}\\n`));
	assert.doesNotMatch(dive, /\nlinks:/, "a dive links nothing back");
	assert.match(dive, /\n## \d{4}-\d\d-\d\dT[\d:.]+Z jumped\n\ndiver@example\.com picked it up\.\n\n- data: workspace\/data on \w+, working work\/ideas\n$/);
	assert.match(f.doc(f.featId), new RegExp(`- kb/${id}\\.md:\\n {6}rel: dives\\.feat\\n`));
	assert.equal(git(f.checkout, "symbolic-ref", "--short", "HEAD"), branchOf(f, id), "the scope on the dive branch");
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branchOf(f, id), "and the hero");
	assert.equal(git(f.hero, "rev-parse", "main"), git(f.hero, "rev-parse", "HEAD"), "cut from its home after the jump record");
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), trunk, "with no work branch yet, it starts at trunk");
	assert.match(git(f.hero, "log", "-1", "--format=%s"), /^jump\([0-9a-f]{6}\.ideas\): diver@example\.com picked it up$/, "the command first, then the dive it acted on");
	assert.equal(git(f.hero, "log", "-1", "--format=%(trailers:only,unfold)"), "Co-Authored-By: nosedive test <noreply@nosedive.dev>", "which says nosedive made it, once");
	assert.equal(git(f.hero, "status", "--porcelain"), "", "the feat's link rides the same commit");
	assert.equal(git(f.hero, "rev-parse", "HEAD"), git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0], "the bookkeeping pushed to the home's upstream");
	assert.deepEqual(f.out.slice(-4), [`dive  kb/${id}.md`, `feat  kb/${f.featId}.md`, "data  workspace/data", nudge(`kb/${f.featId}.md`)], "the feat its brief, as it was jumped bare");
});

test("jump's usage, which --help --more prints, says what it does with uncommitted changes and that it ends with the nudge", () => {
	const body = readFileSync(new URL("../kb/01a15bb2-736b-7eac-84a7-3389e72d9590.md", import.meta.url), "utf8");
	const usage = /(?:^|\n)## Usage\n([\s\S]*?)(?=\n## |$)/.exec(body)![1]!;
	assert.match(usage, /off a dive branch, an unclean hero tree is refused \(jump-needs-clean-tree\)/);
	assert.match(usage, /a scope checkout jump would move that has uncommitted changes or untracked files is refused, each named, before anything moves/);
	assert.match(usage, /A checkout already where the dive wants it, as on a dive branch, is left as it is/);
	assert.match(usage, /pack's work-in-progress commit on this dive is undone, so packed work comes back uncommitted/);
	assert.match(usage, /to do the dive's work now, from its brief to its feat's Done when, and to pack or land it only when the pilot asks/);
});

test("a dive named feat first, as dives were before names went hex first, is jumped by its quid and keeps its name, and every jump ends with the nudge naming its brief", async () => {
	const f = fixture("jump-old-name");
	const id = f.plan();
	const old = `ideas.${id.slice(-6)}`;
	await jump({ ref: id }, f.ctx);
	assert.equal(f.onDeck(), id);
	assert.match(f.doc(id), new RegExp(`\\nname: ${old.replace(".", "\\.")}\\n`), "its name kept");
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), `jump(${old}): diver@example.com picked it up`);
	assert.equal(f.out.at(-1), nudge(`kb/${id}.md`), "a planned dive its own brief");

	f.out.length = 0;
	await jump({}, f.ctx);
	assert.equal(f.out.at(-1), nudge(`kb/${id}.md`), "on its branch too");

	writeFileSync(join(f.checkout, "draft.md"), "draft\n");
	await pack({}, f.ctx);
	f.out.length = 0;
	await jump({ ref: `kb/${id}.md` }, f.ctx);
	assert.equal(git(f.checkout, "status", "--porcelain"), "?? draft.md", "its old-named work in progress undone");
	assert.equal(f.out.at(-1), nudge(`kb/${id}.md`), "and resumed");
});

test("takes a doc's path as next prints it, a feat's or a dive's, for its quid (listed-paths-accepted)", async () => {
	const f = fixture("jump-listed-path");
	await jump({ ref: `kb/${f.featId}.md` }, f.ctx);
	const id = f.onDeck();
	await pack({}, f.ctx);
	await jump({ ref: `kb\\${id.toUpperCase()}.md` }, f.ctx);
	assert.equal(f.onDeck(), id, "the dive by its Windows path, in any case");
	await pack({}, f.ctx);
	await assert.rejects(jump({ ref: "kb/nope.md" }, f.ctx), /no doc kb\/nope\.md in the hero/);
});

test("a hero with a branch named nosedive still gets its dive branch, which is one segment", async () => {
	const f = fixture("jump-nosedive-branch");
	git(f.hero, "branch", "nosedive");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	assert.match(branchOf(f, id), new RegExp(`^nosedive-[0-9a-f]{12}-${id}$`));
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branchOf(f, id));
	assert.equal(git(f.checkout, "symbolic-ref", "--short", "HEAD"), branchOf(f, id));
});

test("refuses a second dive while on a dive branch or holding one, a doc that is neither feat nor dive, and a dive another checkout holds; jumping the dive on deck again records nothing", async () => {
	const f = fixture("jump-refusals");
	await assert.rejects(jump({ ref: f.repoId }, f.ctx), /data is no feat: nothing reaches it from a root of the hero through a .feat link; link it from a feat first/);
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	await assert.rejects(jump({ ref: f.featId, sure: true }, f.ctx), new RegExp(`the hero is on dive ${id.slice(-6)}\\.ideas \\(${id}\\)'s branch: pack, land or bail it first`));

	// Off its dive branch, the checkout still holds it: only that dive can be jumped.
	git(f.hero, "switch", "-q", "main");
	await assert.rejects(jump({ ref: f.featId, sure: true }, f.ctx), new RegExp(`this checkout has dive branch ${branchOf(f, id).replace(/\//g, "\\/")}: switch to it, then pack, land or bail it first`));
	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branchOf(f, id), "back onto it");

	const other = join(f.hero, "..", "other-checkout");
	git(f.hero, "worktree", "add", "-q", "-b", "other", other, "main");
	git(other, "branch", "-q", "-u", "origin/main");
	await assert.rejects(jump({ ref: id }, { ...f.ctx, cwd: other }), new RegExp(`dive ${id.slice(-6)}\\.ideas is held by diver@example\\.com in another checkout of the hero: pack it there \\(held-by-checkout\\)`));
	git(f.hero, "config", "user.email", "other@example.com");
	await assert.rejects(jump({ ref: id }, { ...f.ctx, cwd: other }), new RegExp(`dive ${id.slice(-6)}\\.ideas is held by diver@example\\.com \\(held-by-checkout\\)$`));
	git(f.hero, "config", "user.email", "diver@example.com");

	const before = git(f.hero, "rev-parse", "HEAD");
	writeFileSync(join(f.checkout, "draft.md"), "mine\n");
	await jump({}, f.ctx);
	assert.equal(git(f.hero, "rev-parse", "HEAD"), before, "nothing recorded");
	assert.equal(git(f.checkout, "status", "--porcelain"), "?? draft.md", "its checkout is the diver's to change");
});

for (const outcome of ["landed", "bailed"] as const) {
	test(`a ${outcome} dive is refused on every path, before anything changes: by its quid, as a leftover branch's dive, and on that branch`, async () => {
		const f = fixture(`jump-over-${outcome}`);
		await jump({ ref: f.featId }, f.ctx);
		const id = f.onDeck();
		const branch = branchOf(f, id);
		f.commit("idea.md", "an idea\n");
		if (outcome === "landed") await land({}, f.ctx);
		else await bail({ reason: "a test" }, f.ctx);
		const over = `dive ${id.slice(-6)}\\.ideas is over: it ${outcome}`;
		await assert.rejects(jump({ ref: id }, f.ctx), new RegExp(`${over}$`), "named by its quid, no branch left");

		const leave = new RegExp(`${over}; to leave its branch, switch to its home, main, the branch it was jumped from, and delete ${branch}$`);
		const refusedAsWas = async (args: { ref?: string }) => {
			const on = git(f.hero, "symbolic-ref", "--short", "HEAD");
			const tip = git(f.hero, "rev-parse", branch);
			const scope = git(f.checkout, "rev-parse", "HEAD");
			await assert.rejects(jump(args, f.ctx), leave);
			assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), on, "the hero's branch unchanged");
			assert.equal(git(f.hero, "rev-parse", branch), tip, "the leftover branch where it was");
			assert.equal(git(f.checkout, "rev-parse", "HEAD"), scope, "the scope checkout where it was");
		};
		git(f.hero, "branch", "-q", branch, "HEAD");
		await refusedAsWas({ ref: id });
		git(f.hero, "switch", "-q", branch);
		await refusedAsWas({});
	});
}

test("a dive minted from another clone sharing the home's upstream is found once fetched, and refused as held there; a dirty hero is refused before anything", async () => {
	const f = fixture("jump-stale");
	const other = join(f.hero, "..", "other-clone");
	git(f.hero, "clone", "-q", git(f.hero, "remote", "get-url", "origin"), other);
	git(other, "config", "user.name", "Work Test");
	git(other, "config", "user.email", "diver@example.com");
	await jump({ ref: f.featId }, { ...f.ctx, cwd: other });
	// The dive is the doc jump's bookkeeping added beside the feat.
	const id = git(other, "diff", "--name-only", "HEAD^", "HEAD").split("\n").map((path) => /([0-9a-f-]{36})\.md$/.exec(path)?.[1]).find((each) => each && each !== f.featId)!;

	writeFileSync(join(f.hero, "scratch.md"), "mine\n");
	await assert.rejects(jump({ ref: id }, f.ctx), /the hero has uncommitted changes, and jump switches its branch: commit them first \(jump-needs-clean-tree\)/);
	git(f.hero, "clean", "-qf");
	await assert.rejects(jump({ ref: id }, f.ctx), new RegExp(`dive ${id.slice(-6)}\\.ideas is held by diver@example\\.com in another checkout of the hero: pack it there`));
	assert.equal(git(f.hero, "rev-parse", "main"), git(other, "rev-parse", "main"), "main fast-forwarded to the other clone's record");
});

test("without a ref, takes the one dive waiting for the pilot, and refuses when none is", async () => {
	const f = fixture("jump-bare");
	await assert.rejects(jump({}, f.ctx), /no dive waits for you here: `nosedive jump <feat or dive>` names one/);
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	await pack({}, f.ctx);
	await jump({}, f.ctx);
	assert.equal(f.onDeck(), id);
});

test("picks packed work up on its work branch's new tip", async () => {
	const f = fixture("jump-rebase");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	f.commit("idea.md", "mine\n");
	await pack({}, f.ctx);

	// Someone else lands on the work branch meanwhile.
	const other = join(f.hero, "..", "other");
	git(f.hero, "clone", "-q", f.remote, other);
	writeFileSync(join(other, "theirs.md"), "theirs\n");
	git(other, "add", "-A");
	git(other, "-c", "user.name=O", "-c", "user.email=o@example.com", "commit", "-q", "-m", "theirs");
	git(other, "push", "-q", "origin", "HEAD:refs/heads/work/ideas");
	const tip = git(other, "rev-parse", "HEAD");

	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD^"), tip, "the work sits on the branch's tip");
	assert.equal(git(f.checkout, "log", "-1", "--format=%s"), "add idea.md");
	assert.match(f.doc(id), /, working work\/ideas; rebased onto work\/ideas\n$/);
});

test("replays the dive's hero work on its bookkeeping, and refuses while the home holds commits its upstream lacks", async () => {
	const f = fixture("jump-hero");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	writeFileSync(join(f.hero, "kb", "note.md"), "a note\n");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-q", "-m", "a note");
	writeFileSync(join(f.hero, "kb", "draft.md"), "half\n");
	await pack({}, f.ctx);
	assert.equal(existsSync(join(f.hero, "kb", "note.md")), false, "the hero is back home");
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "main");

	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), "a note");
	assert.match(git(f.hero, "log", "-1", "--format=%s", "HEAD^"), /^jump\([0-9a-f]{6}\.ideas\): diver@example\.com picked it up$/);
	assert.equal(git(f.hero, "status", "--porcelain"), "?? kb/draft.md", "uncommitted again");
	assert.match(f.doc(id), /\n- hero: 2 commits replayed\n$/);

	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-q", "-m", "a draft");
	await land({}, f.ctx);
	git(f.hero, "commit", "-q", "--allow-empty", "-m", "stray");
	await assert.rejects(jump({ ref: f.featId, sure: true }, f.ctx), /main holds 1 commit origin\/main lacks that nosedive did not commit: push or drop it first:\n {2}[0-9a-f]{7} stray$/);
});

test("moves a checkout left from other work, keeping commits origin lacks on an orphan ref, and refuses one with uncommitted changes", async () => {
	const f = fixture("jump-orphan");
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	await land({}, f.ctx);
	const stray = f.commit("stray.md", "stray\n");

	writeFileSync(join(f.checkout, "draft.md"), "draft\n");
	await assert.rejects(jump({ ref: f.featId }, f.ctx), /ideas has a dive on it \(\S+\), so a bare jump would start it over/);
	const planned = f.plan();
	await assert.rejects(jump({ ref: planned }, f.ctx), /jump would lose work, so nothing moved:\n {2}workspace\/data has uncommitted changes or untracked files/);
	git(f.checkout, "clean", "-qf");

	await jump({ ref: planned }, f.ctx);
	const id = f.onDeck();
	assert.equal(id, planned);
	const kept = `refs/nosedive-orphans/${f.heroId}/${stray}`;
	assert.equal(f.remoteRef(kept), "", "never pushed");
	assert.equal(git(f.checkout, "rev-parse", kept), stray, "kept on a local ref");
	assert.match(f.err.join("\n"), new RegExp(`warning: data holds 1 commit no ref on origin has, which are on this machine only, under ${kept}:\\n {2}${stray.slice(0, 7)} add stray\\.md\\nto recover it: git switch -c <name> ${kept}`));
	assert.equal(git(f.checkout, "symbolic-ref", "--short", "HEAD"), branchOf(f, id));
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), f.remoteRef("refs/heads/work/ideas"), "a feat's dives stack on its work branch");
	assert.match(f.doc(id), new RegExp(`; its 1 commit origin lacked kept on ${kept}, on this machine only\\n$`));
});

test("a feat under a hero's second root gets its dive in that root's directory, and packs and jumps again", async () => {
	const f = fixture("jump-roots", { roots: true });
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	assert.match(f.doc(id), /^---\nkind: dive\n/, "minted beside its feat in ./docs");
	assert.match(f.doc(f.featId), new RegExp(`- docs/${id}\.md:\n {6}rel: dives\.feat\n`));
	await pack({}, f.ctx);
	await jump({ ref: id }, f.ctx);
	assert.equal(f.onDeck(), id);
	assert.equal(git(f.hero, "status", "--porcelain"), "");
});

test("pack, jump and land preserve the canonical version while work refs keep their lease meaning", async () => {
	const f = fixture("canonical-loop");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const versionLine = `      version: ${f.schemaVersion}`;
	assert.ok(f.doc(id).includes(versionLine));
	const commit = f.commit("work.txt", "one\n");
	await pack({}, f.ctx);
	assert.ok(f.doc(id).includes(versionLine));
	assert.match(f.doc(id), new RegExp(`ref: ${commit}`));
	await jump({ ref: id }, f.ctx);
	assert.ok(f.doc(id).includes(versionLine));
	assert.match(f.doc(id), new RegExp(`ref: ${commit}`));
	await land({}, f.ctx);
	assert.ok(f.doc(id).includes(versionLine), "land never rewrites a schema version");
});

test("a meta entry beside the canonical one survives jump, pack and land untouched while work scopes still work", async () => {
	const f = fixture("meta-scope");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const meta = `  - ${mintUuid()}:\n      version: 0123abc\n      schema: 0123456789ab\n      meta:\n        note: kept\n`;
	writeFileSync(join(f.hero, "kb", `${id}.md`), f.doc(id).replace("\nscopes:\n", `\nscopes:\n${meta}`));
	git(f.hero, "commit", "-qam", "meta entry");
	git(f.hero, "push", "-q", "origin", "HEAD:main");
	const canonical = `      canonical: true\n      version: ${f.schemaVersion}\n`;
	const intact = () => {
		assert.ok(f.doc(id).includes(meta), "the meta entry is carried as it was");
		assert.ok(f.doc(id).includes(canonical), "the canonical entry is carried as it was");
	};
	intact();
	const commit = f.commit("work.txt", "one\n");
	await pack({}, f.ctx);
	intact();
	assert.match(f.doc(id), new RegExp(`ref: ${commit}`));
	await jump({ ref: id }, f.ctx);
	intact();
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), commit);
	await land({}, f.ctx);
	intact();
});

test("an unpublished dive schema refuses before jump moves a scope", async () => {
	const f = fixture("unpublished-dive");
	newSchema(f);
	await assert.rejects(jump({ ref: f.featId }, f.ctx), /land|push/);
	assert.equal(existsSync(f.checkout), false);
});

test("a dive schema on the feat's work branch is accepted and pinned", async () => {
	const f = fixture("work-branch-dive");
	const version = newSchema(f);
	git(f.schemaRepo, "push", "-q", "origin", "HEAD:refs/heads/work/ideas");
	await jump({ ref: f.featId }, f.ctx);
	assert.ok(f.doc(f.onDeck()).includes(`      version: ${version}\n`));
	assert.match(f.doc(f.onDeck()), /\n {6}schema: [0-9a-f]{12}\n/);
});

/** Commits a change to the dive schema's repo that origin's trunk lacks, and makes it the kind's version. */
function newSchema(f: ReturnType<typeof fixture>): string {
	writeFileSync(join(f.schemaRepo, "schema.txt"), "new schema\n");
	git(f.schemaRepo, "add", "schema.txt");
	git(f.schemaRepo, "commit", "-q", "-m", "new schema");
	const version = git(f.schemaRepo, "rev-parse", "HEAD");
	(f.ctx.capes[1]!.kinds.dive as { version: string }).version = version;
	return version;
}

test("refuses a home with no upstream that is not cut from origin's trunk, so no record is stranded in a local branch", async () => {
	const f = fixture("jump-upstream");
	git(f.hero, "switch", "-q", "--orphan", "local-only");
	git(f.hero, "checkout", "main", "--", ".");
	git(f.hero, "commit", "-q", "--allow-empty", "-m", "unrelated");
	await assert.rejects(jump({ ref: f.featId }, f.ctx), /local-only has no upstream, so the dive's records would be stranded here: push it first, as `git push -u origin local-only`$/);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "local-only", "nothing moved");
});

type F = ReturnType<typeof fixture>;
const NOSEDIVE = { GIT_COMMITTER_NAME: "nosedive", GIT_COMMITTER_EMAIL: "noreply@nosedive.dev" };

/** A linked worktree of the hero on a new branch cut from main, with no upstream, as a Claude Code worktree is. */
function worktree(f: F, name: string): string {
	const dir = join(tempDir("jump-wt"), name);
	git(f.hero, "worktree", "add", "-q", "-b", name, dir, "main");
	return dir;
}

/** Commits a file as nosedive would, a person its author. */
function own(dir: string, file: string, text: string, subject: string): void {
	writeFileSync(join(dir, file), text);
	git(dir, "add", "-A");
	const made = spawnSync("git", ["commit", "-q", "-m", subject], { cwd: dir, env: { ...process.env, ...NOSEDIVE }, encoding: "utf8" });
	assert.equal(made.status, 0, made.stderr);
}

/** A clone of the hero's origin, which pushes commits to main as someone else. */
function other(f: F): { push(file: string, text: string, subject?: string): string; dir: string } {
	const parent = tempDir("jump-other");
	git(parent, "clone", "-q", git(f.hero, "remote", "get-url", "origin"), "clone");
	const dir = join(parent, "clone");
	return {
		dir,
		push(file, text, subject = "upstream moved") {
			writeFileSync(join(dir, file), text);
			git(dir, "add", "-A");
			git(dir, "-c", "user.name=Other", "-c", "user.email=other@example.com", "commit", "-q", "-m", subject);
			git(dir, "push", "-q", "origin", "HEAD:main");
			return git(dir, "rev-parse", "HEAD");
		},
	};
}

const originMain = (f: F) => git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0];
const diveRefs = (f: F) => git(f.hero, "ls-remote", "origin", "refs/nosedive/*");

test("a fresh linked worktree with no upstream, a plan commit nosedive made and an upstream that moved, is jumped with no hand git: trunk adopted, the commit replayed and published", async () => {
	const f = fixture("jump-fresh");
	const wt = worktree(f, "worktree-agent");
	const id = f.plan("Do the fresh part", true, wt);
	const moved = other(f).push("other.md", "moved\n");
	const ctx = { ...f.ctx, cwd: wt };
	await jump({ ref: id }, ctx);

	assert.equal(git(wt, "config", "branch.worktree-agent.merge"), "refs/heads/main");
	assert.match(f.out.join("\n"), /jump: worktree-agent had no upstream; set it to origin\/main, which it is cut from\n/);
	assert.match(f.out.join("\n"), /jump: published 1 commit nosedive made on worktree-agent to origin\/main with its record:\n[0-9a-f]{7} plan a dive\n/);
	const published = git(wt, "rev-parse", "worktree-agent");
	assert.equal(originMain(f), published, "published, the record on top");
	assert.deepEqual(git(wt, "log", "--format=%s", `${moved}..${published}`).split("\n"), [`jump(ideas.${id.slice(-6)}): diver@example.com picked it up`, "plan a dive"]);
	assert.equal(git(wt, "log", "-1", "--format=%cn <%ce>", "worktree-agent^"), "nosedive <noreply@nosedive.dev>", "the replayed commit keeps nosedive as committer");
	assert.equal(git(wt, "log", "-1", "--format=%an", "worktree-agent^"), "Work Test", "and its author");
});

test("a commit made by core's commitFiles is one jump publishes", async () => {
	const f = fixture("jump-producer");
	const wt = worktree(f, "worktree-agent");
	writeFileSync(join(wt, "note.md"), "a note\n");
	commitFiles(wt, [join(wt, "note.md")], "add a note", "test");
	await jump({ ref: f.featId }, { ...f.ctx, cwd: wt });
	assert.match(f.out.join("\n"), /jump: published 1 commit nosedive made on worktree-agent to origin\/main with its record:\n[0-9a-f]{7} add a note\n/);
});

test("a home commit a person made is refused and listed, with nothing rewritten or published, and no upstream left set", async () => {
	const f = fixture("jump-hand");
	const wt = worktree(f, "worktree-agent");
	const id = f.plan("Do the hand part", true, wt);
	git(wt, "commit", "-q", "--allow-empty", "-m", "by hand");
	const before = git(wt, "rev-parse", "worktree-agent");
	const tip = other(f).push("other.md", "moved\n");
	await assert.rejects(jump({ ref: id }, { ...f.ctx, cwd: wt }), /worktree-agent holds 1 commit origin\/main lacks that nosedive did not commit: push or drop it first:\n {2}[0-9a-f]{7} by hand$/);
	assert.equal(git(wt, "rev-parse", "worktree-agent"), before, "nothing rewritten");
	assert.equal(originMain(f), tip, "nothing published");
	assert.equal(git(wt, "symbolic-ref", "--short", "HEAD"), "worktree-agent", "nothing moved");
	assert.equal(spawnSync("git", ["config", "branch.worktree-agent.merge"], { cwd: wt, encoding: "utf8" }).stdout.trim(), "", "the upstream jump set is taken back");
});

test("a replay that conflicts with the moved upstream changes and publishes nothing", async () => {
	const f = fixture("jump-conflict");
	const wt = worktree(f, "worktree-agent");
	const id = f.plan("Do the conflicting part", true, wt);
	const tip = other(f).push(`kb/${id}.md`, "someone else's\n", "same file");
	const before = git(wt, "rev-parse", "worktree-agent");
	await assert.rejects(jump({ ref: id }, { ...f.ctx, cwd: wt }), /the 1 commit nosedive made on worktree-agent conflicts with origin\/main as it moved, so nothing was changed: push or drop it first/);
	assert.equal(git(wt, "rev-parse", "worktree-agent"), before);
	assert.equal(originMain(f), tip);
});

test("a multi-commit replay drops a commit the upstream already holds, and publishes the rest in order", async () => {
	const f = fixture("jump-multi");
	const wt = worktree(f, "worktree-agent");
	const id = f.plan("Do the multiple part", true, wt);
	own(wt, "b.md", "b\n", "add b");
	own(wt, "c.md", "c\n", "add c");
	other(f).push("b.md", "b\n", "b by someone else");
	await jump({ ref: id }, { ...f.ctx, cwd: wt });
	assert.match(f.out.join("\n"), /jump: published 2 commits nosedive made on worktree-agent to origin\/main with its record:\n[0-9a-f]{7} plan a dive\n[0-9a-f]{7} add c\n/);
	assert.deepEqual(git(wt, "log", "--format=%s", "-5", "worktree-agent").split("\n").slice(1, 4), ["add c", "plan a dive", "b by someone else"]);
	assert.equal(originMain(f), git(wt, "rev-parse", "worktree-agent"));
});

test("a push the remote rejects because it moved between fetch and push is planned again from the new tip, and published", async () => {
	const f = fixture("jump-race");
	const wt = worktree(f, "worktree-agent");
	const id = f.plan("Do the racing part", true, wt);
	const clone = other(f);
	// The remote moves after push has looked at it, once.
	const marker = join(tempDir("jump-hook"), "ran");
	const hook = join(git(wt, "rev-parse", "--git-common-dir").replace(/\\/g, "/"), "hooks", "pre-push");
	writeFileSync(hook, `#!/bin/sh\nif [ -e "${marker.replace(/\\/g, "/")}" ]; then exit 0; fi\ntouch "${marker.replace(/\\/g, "/")}"\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ncd "${clone.dir.replace(/\\/g, "/")}" || exit 1\necho raced > raced.md\ngit add -A\ngit -c user.name=Other -c user.email=other@example.com commit -q -m raced\ngit push -q origin HEAD:main\nexit 0\n`);
	chmodSync(hook, 0o755);
	await jump({ ref: id }, { ...f.ctx, cwd: wt });
	rmSync(hook);
	assert.equal(existsSync(marker), true, "the remote did move");
	assert.deepEqual(git(wt, "log", "--format=%s", "-3", "worktree-agent").split("\n").slice(1), ["plan a dive", "raced"]);
	assert.equal(originMain(f), git(wt, "rev-parse", "worktree-agent"));
});

test("a failed fetch refuses with nothing changed, rather than go on with a stale tracking ref", async () => {
	const f = fixture("jump-offline");
	const id = f.plan("Do the offline part");
	git(f.hero, "remote", "set-url", "origin", join(tempDir("jump-gone"), "gone.git"));
	const before = git(f.hero, "rev-parse", "HEAD");
	await assert.rejects(jump({ ref: id }, f.ctx), /cannot fetch origin\/main, so nothing was changed \(offline, or the branch is gone\?\)/);
	assert.equal(git(f.hero, "rev-parse", "HEAD"), before);
	const wt = worktree(f, "worktree-agent");
	await assert.rejects(jump({ ref: id }, { ...f.ctx, cwd: wt }), /cannot reach origin to find worktree-agent's trunk, so nothing was changed \(offline\?\)/, "offline is not a home with no upstream");
	assert.equal(spawnSync("git", ["config", "branch.worktree-agent.merge"], { cwd: wt, encoding: "utf8" }).stdout.trim(), "");
});

for (const state of ["stale", "missing"] as const) {
	test(`adopts the trunk origin names, with the local origin/HEAD ${state}`, async () => {
		const f = fixture(`jump-default-${state}`);
		const origin = git(f.hero, "remote", "get-url", "origin");
		git(f.hero, "push", "-q", "origin", "main:refs/heads/trunk2");
		git(origin, "symbolic-ref", "HEAD", "refs/heads/trunk2");
		if (state === "stale") git(f.hero, "remote", "set-head", "origin", "main");
		else spawnSync("git", ["symbolic-ref", "-d", "refs/remotes/origin/HEAD"], { cwd: f.hero });
		const wt = worktree(f, "worktree-agent");
		await jump({ ref: f.featId }, { ...f.ctx, cwd: wt });
		assert.match(f.out.join("\n"), /jump: worktree-agent had no upstream; set it to origin\/trunk2, which it is cut from\n/);
		assert.equal(git(wt, "config", "branch.worktree-agent.merge"), "refs/heads/trunk2");
	});
}

/** A jumped dive whose home, main, holds a commit nosedive made that conflicts with the upstream as it moved. */
async function conflicted(label: string) {
	const f = fixture(label);
	await jump({ ref: f.featId }, f.ctx);
	const dive = git(f.hero, "symbolic-ref", "--short", "HEAD");
	f.commit("idea.md", "an idea\n");
	git(f.hero, "checkout", "-q", "main");
	own(f.hero, "clash.md", "mine\n", "a turn");
	git(f.hero, "checkout", "-q", dive);
	other(f).push("clash.md", "theirs\n", "clash");
	return { f, dive };
}

test("pack and bail, finding the home's replay conflicts, push nothing, delete nothing and leave the dive on deck", async () => {
	const puts = [(ctx: F["ctx"]) => pack({}, ctx), (ctx: F["ctx"]) => bail({ reason: "a test" }, ctx)];
	for (const put of puts) {
		const { f, dive } = await conflicted("jump-put-conflict");
		const refs = diveRefs(f);
		const tip = originMain(f);
		await assert.rejects(put(f.ctx), /conflicts with origin\/main as it moved, so nothing was changed/);
		assert.equal(diveRefs(f), refs, "no dive ref pushed or deleted");
		assert.equal(originMain(f), tip);
		assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), dive, "still on the dive branch");
		assert.equal(git(f.checkout, "symbolic-ref", "--short", "HEAD"), dive, "and its checkout");
	}
});

test("a home checked out in another worktree is left alone: land refuses, naming it, before anything is pushed", async () => {
	const f = fixture("jump-elsewhere");
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	const wt = join(tempDir("jump-wt"), "main-copy");
	git(f.hero, "worktree", "add", "-q", wt, "main");
	own(wt, "turn.md", "a turn\n", "a turn");
	other(f).push("other.md", "moved\n");
	const tip = originMain(f);
	const heads = git(f.checkout, "ls-remote", "origin", "refs/heads/work/ideas");
	await assert.rejects(land({}, f.ctx), /main is checked out in .*main-copy, which a moved branch would leave confused; nothing was changed/);
	assert.equal(originMain(f), tip);
	assert.equal(git(f.checkout, "ls-remote", "origin", "refs/heads/work/ideas"), heads, "no scope pushed");
	assert.equal(git(wt, "log", "-1", "--format=%s"), "a turn", "the other checkout untouched");
});

test("a dive jumped from a pushed branch keeps every record and its hero work there, trunk untouched, and the loop returns to it", async () => {
	const f = fixture("jump-home");
	const trunk = git(f.hero, "rev-parse", "origin/main");
	git(f.hero, "switch", "-q", "-c", "spec");
	writeFileSync(join(f.hero, "SPEC.md"), "the spec\n");
	git(f.hero, "add", "SPEC.md");
	git(f.hero, "commit", "-q", "-m", "spec");
	git(f.hero, "push", "-q", "-u", "origin", "spec");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	assert.equal(git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0], trunk, "trunk on origin never moved");
	assert.match(git(f.hero, "log", "-1", "--format=%s", "origin/spec"), /^jump\([0-9a-f]{6}\.ideas\)/, "the record is on the home's upstream");
	writeFileSync(join(f.hero, "NOTE.md"), "hero work\n");
	git(f.hero, "add", "NOTE.md");
	git(f.hero, "commit", "-q", "-m", "hero note");
	await pack({}, f.ctx);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "spec", "back home");
	assert.equal(git(f.hero, "log", "--format=%s", "spec").includes("hero note"), false, "the work waits on the dive's ref");
	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), "hero note", "replayed on the dive branch");
	await land({}, f.ctx);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "spec");
	assert.deepEqual(git(f.hero, "log", "-3", "--format=%s", "origin/spec").split("\n").map((line) => line.split(":")[0]), [`land(${id.slice(-6)}.ideas)`, "hero note", `jump(${id.slice(-6)}.ideas)`], "the hero's work bookended on the home's upstream");
	assert.equal(git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0], trunk, "and still not on trunk");
});

test("a dive this checkout holds whose branch is gone is jumped again without a record, its packed hero work replayed; on its branch, a jump sets a lost scope checkout up again", async () => {
	const f = fixture("jump-lost");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const work = f.commit("idea.md", "an idea\n");
	git(f.checkout, "push", "-q", "origin", `HEAD:refs/heads/work/ideas`);

	// The scope checkout lost: jumping the dive on deck puts it back, the dive branch's commit kept.
	const cache = git(f.checkout, "rev-parse", "--git-common-dir");
	git(cache, "worktree", "remove", "--force", f.checkout);
	const records = git(f.hero, "rev-list", "--count", "HEAD");
	await jump({}, f.ctx);
	assert.equal(git(f.hero, "rev-list", "--count", "HEAD"), records, "nothing recorded");
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), work, "the scope back at the dive's work");

	// The hero's dive branch lost: jumping the dive cuts it again from home.
	const branch = git(f.hero, "symbolic-ref", "--short", "HEAD");
	git(f.hero, "switch", "-q", "main");
	git(f.hero, "branch", "-q", "-D", branch);
	const before = git(f.hero, "rev-parse", "main");
	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branch, "on its branch again");
	assert.equal(git(f.hero, "rev-parse", "main"), before, "no record");
});

test("a dive legacy left held by a bare email is taken over by a checkout of that email, and refused to anyone else (legacy-bare-diver)", async () => {
	const f = fixture("jump-bare-diver");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	await pack({}, f.ctx);
	const path = join(f.hero, "kb", `${id}.md`);
	const bare = (email: string) => {
		const text = f.doc(id).replace(/\n  packer: [^\n]+\n/, "\n").replace(/\n  diver: [^\n]*\n/, "\n");
		assert.ok(text.includes("\nmeta:\n"), "the packed dive has meta");
		writeFileSync(path, text.replace("\nmeta:\n", `\nmeta:\n  diver: ${email}\n`));
		git(f.hero, "commit", "-qam", `legacy diver ${email}`);
		git(f.hero, "push", "-q");
	};
	bare("someone@example.com");
	await assert.rejects(jump({ ref: id }, f.ctx), /is held by someone@example\.com, in no checkout in particular: only a checkout whose git user\.email is someone@example\.com can take it over \(legacy-bare-diver\)/);
	bare("diver@example.com");
	await jump({ ref: id }, f.ctx);
	assert.equal(f.onDeck(), id);
	assert.match(f.doc(id), /\n  diver: diver@example\.com#[0-9a-f]{12}\n/);
});

/** Commits a file a person made, with an author, date and subject fixed, so two of them differ only in content. */
function alike(dir: string, file: string, text: string): void {
	writeFileSync(join(dir, file), text);
	git(dir, "add", "-A");
	const env = { ...process.env, GIT_AUTHOR_NAME: "Alike", GIT_AUTHOR_EMAIL: "alike@example.com", GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z" };
	const made = spawnSync("git", ["-c", "user.name=Someone", "-c", "user.email=someone@example.com", "commit", "-q", "-m", "alike"], { cwd: dir, env, encoding: "utf8" });
	assert.equal(made.status, 0, made.stderr);
}

// Publishing is concurrency safe (jump-publish-is-concurrency-safe)

/**
 * Makes each push to `main` from `dir` run a step first, as a pre-push hook does, so a test can have the world change while
 * the push is in flight: the first push runs `steps[0]`, the second `steps[1]`, and any later one nothing. A step is shell.
 */
function raceOnMain(dir: string, steps: string[]): void {
	const state = tempDir("race");
	const slash = (path: string) => path.replace(/\\/g, "/");
	steps.forEach((step, i) => writeFileSync(join(state, `step${i + 1}.sh`), `${step}\n`));
	const hook = join(git(dir, "rev-parse", "--path-format=absolute", "--git-common-dir"), "hooks", "pre-push");
	const script = [
		"#!/bin/sh",
		'input=$(cat)',
		'case "$input" in *" refs/heads/main "*) ;; *) exit 0;; esac',
		`n=$(cat "${slash(state)}/n" 2>/dev/null || echo 0)`,
		"n=$((n+1))",
		`echo $n > "${slash(state)}/n"`,
		`[ -f "${slash(state)}/step$n.sh" ] || exit 0`,
		"unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE",
		`sh "${slash(state)}/step$n.sh" >/dev/null 2>&1`,
		"exit 0",
		"",
	].join("\n");
	writeFileSync(hook, script);
	chmodSync(hook, 0o755);
}

const sh = (path: string) => path.replace(/\\/g, "/");
const PERSON = `git -c user.name=Other -c user.email=other@example.com`;

test("pack and bail meet a replay conflict that only shows on a push retry before anything is torn down", async () => {
	const puts = [(ctx: F["ctx"]) => pack({}, ctx), (ctx: F["ctx"]) => bail({ reason: "a test" }, ctx)];
	for (const put of puts) {
		const f = fixture("jump-retry-conflict");
		await jump({ ref: f.featId }, f.ctx);
		const dive = git(f.hero, "symbolic-ref", "--short", "HEAD");
		f.commit("idea.md", "an idea\n");
		git(f.hero, "checkout", "-q", "main");
		own(f.hero, "clash.md", "mine\n", "a turn");
		git(f.hero, "checkout", "-q", dive);
		// Nothing clashes when pack looks; the remote moves with a clash once its push is on the way.
		const clone = other(f);
		raceOnMain(f.hero, [`cd "${sh(clone.dir)}"\necho theirs > clash.md\ngit add -A\n${PERSON} commit -q -m clash\ngit push -q origin HEAD:main`]);
		const refs = diveRefs(f);
		await assert.rejects(put(f.ctx), /conflicts with origin\/main as it moved, so nothing was changed/);
		assert.equal(diveRefs(f), refs, "no dive ref pushed or deleted");
		assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), dive, "still on the dive branch");
		assert.equal(git(f.checkout, "symbolic-ref", "--short", "HEAD"), dive, "and its checkout");
	}
});

test("a turn is kept off a home that holds a commit a person made, and nothing of it is pushed", async () => {
	const f = fixture("turn-person");
	await jump({ ref: f.featId }, f.ctx);
	const tree = join(tempDir("jump-wt"), "main-copy");
	git(f.hero, "worktree", "add", "-q", tree, "main");
	alike(tree, "a.md", "mine\n");
	git(f.hero, "worktree", "remove", "--force", tree);
	own(f.hero, "turn.md", "a turn\n", "a turn");
	const before = originMain(f);
	const home = git(f.hero, "rev-parse", "main");
	const outcome = putTurnOnHome(findBridge(f.hero)!, "main", git(f.hero, "rev-parse", "HEAD"));
	assert.equal(outcome.kind, "dive-branch-only");
	assert.match("why" in outcome ? outcome.why : "", /main holds 1 commit origin\/main lacks that nosedive did not commit/);
	assert.equal(originMain(f), before, "nothing published");
	assert.equal(git(f.hero, "rev-parse", "main"), home, "the home is as it was");
});

test("a jump of a doc the hero does not know changes nothing: no upstream set, nothing published", async () => {
	const f = fixture("jump-unknown");
	const wt = worktree(f, "worktree-agent");
	f.plan("Do the unknown part", true, wt);
	const before = originMain(f);
	const at = git(wt, "rev-parse", "worktree-agent");
	await assert.rejects(jump({ ref: mintUuid() }, { ...f.ctx, cwd: wt }), /no doc [0-9a-f-]+ in the hero on worktree-agent/);
	assert.equal(originMain(f), before, "nothing published");
	assert.equal(git(wt, "rev-parse", "worktree-agent"), at);
	assert.equal(spawnSync("git", ["config", "branch.worktree-agent.merge"], { cwd: wt, encoding: "utf8" }).stdout.trim(), "", "no upstream set");

	// With an upstream already, the same.
	own(f.hero, "mine.md", "mine\n", "a turn");
	await assert.rejects(jump({ ref: mintUuid() }, f.ctx), /no doc [0-9a-f-]+ in the hero on main/);
	assert.equal(originMain(f), before, "nothing published");
});

// One publish primitive (one-publish-primitive): the commands' concurrency tests, with the races injected at exact points.

test("T2: a commit a person makes on the home while the record is pushed is never published, and is kept", async () => {
	const f = fixture("jump-t2");
	raceOnMain(f.hero, [`cd "${sh(f.hero)}"\necho person > person.md\ngit add -A\ngit -c user.name=Person -c user.email=person@example.com commit -q -m person`]);
	await assert.rejects(jump({ ref: f.featId }, f.ctx), /holds 1 commit origin\/main lacks that nosedive did not commit/);
	assert.equal(git(f.hero, "log", "-1", "--format=%s", "main"), "person", "the person's commit is still on the home");
	assert.equal(git(f.hero, "ls-tree", "--name-only", originMain(f)).includes("person.md"), false, "origin never has it");
	assert.equal(existsSync(join(f.hero, "person.md")), true, "nor is the file gone");
});

test("T6: a remote rewound while the home is pushed is refused by the lease, and a person's commit is not republished", async () => {
	const f = fixture("jump-t6");
	const clone = other(f);
	const base = git(clone.dir, "rev-parse", "HEAD");
	clone.push("h.md", "h\n", "by a person");
	git(f.hero, "fetch", "-q", "origin");
	git(f.hero, "merge", "-q", "--ff-only", "origin/main");
	own(f.hero, "n.md", "n\n", "a turn");
	raceOnMain(f.hero, [`cd "${sh(clone.dir)}"\ngit push -q --force origin ${base}:refs/heads/main`]);
	await assert.rejects(jump({ ref: f.featId }, f.ctx), /holds 1 commit origin\/main lacks that nosedive did not commit/);
	assert.equal(originMain(f), base, "nothing republished");
});

test("T7: land meets the hero's replay conflict before any scope is pushed or stamped", async () => {
	const f = fixture("land-t7");
	await jump({ ref: f.featId }, f.ctx);
	const work = f.commit("idea.md", "an idea\n");
	writeFileSync(join(f.hero, "clash.md"), "mine\n");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-q", "-m", "hero work");
	other(f).push("clash.md", "theirs\n", "clash");
	const heads = git(f.checkout, "ls-remote", "origin", "refs/heads/work/ideas");
	await assert.rejects(land({}, f.ctx), /the hero's work conflicts with main, so nothing was landed/);
	assert.equal(git(f.checkout, "ls-remote", "origin", "refs/heads/work/ideas"), heads, "the work branch was not pushed");
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), work, "no stamp left on the scope");
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branchOf(f, f.onDeck()), "still on the dive");
});

test("T1: pack meets a conflict that appears between the plan and the push, and changes nothing anywhere", async () => {
	const f = fixture("pack-t1");
	await jump({ ref: f.featId }, f.ctx);
	const dive = git(f.hero, "symbolic-ref", "--short", "HEAD");
	f.commit("idea.md", "an idea\n");
	git(f.hero, "checkout", "-q", "main");
	own(f.hero, "clash.md", "mine\n", "a turn");
	git(f.hero, "checkout", "-q", dive);
	const clone = other(f);
	raceOnMain(f.hero, [`cd "${sh(clone.dir)}"\necho theirs > clash.md\ngit add -A\n${PERSON} commit -q -m clash\ngit push -q origin HEAD:main`]);
	const refs = diveRefs(f);
	await assert.rejects(pack({}, f.ctx), /conflict/);
	assert.equal(diveRefs(f), refs, "no dive ref pushed or deleted");
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), dive);
	assert.equal(git(f.checkout, "symbolic-ref", "--short", "HEAD"), dive);
});

test("the loop's code holds no reset --hard, no bare git push and no direct ref move: only core's primitive pushes", () => {
	for (const file of ["i01a15bb27be9786f91885a2f0a0fa08e", "if8cb5f3d6de95b8ea88d25f745af7b03", "i0735c57383365d4ca5395ea24f5b0649", "iffc777778a63553ba90babcc038eb748", "i2bcf8d7ee2645df5b261ee1b2135d190", "i01a18f6b14f97ca38a091f6b31317223"]) {
		const text = readFileSync(new URL(`./${file}.ts`, import.meta.url), "utf8");
		assert.doesNotMatch(text, /"reset"|"--hard"|"push"|"update-ref"|"rebase"|"cherry-pick"|"merge"|"branch", "-[dDf]"/, file);
	}
});

test("jump keeps the commits of a dive branch it replaces, though HEAD is elsewhere, on an orphan ref with the warning", async () => {
	const f = fixture("jump-off-head-branch");
	await jump({ ref: f.featId }, f.ctx);
	const local = f.commit("mine.md", "local only\n");
	// The checkout moves off its dive branch, and the work branch on origin moves on meanwhile.
	git(f.checkout, "checkout", "-q", "--detach", "origin/main");
	const parent = tempDir("jump-data-other");
	git(parent, "clone", "-q", f.remote, "clone");
	const clone = join(parent, "clone");
	writeFileSync(join(clone, "theirs.md"), "theirs\n");
	git(clone, "add", "-A");
	git(clone, "-c", "user.name=Other", "-c", "user.email=other@example.com", "commit", "-q", "-m", "theirs");
	git(clone, "push", "-q", "origin", "HEAD:refs/heads/work/ideas");
	f.err.length = 0;
	await jump({}, f.ctx);
	const kept = `refs/nosedive-orphans/${f.heroId}/${local}`;
	assert.equal(git(f.checkout, "rev-parse", kept), local, "the replaced branch's tip is kept");
	assert.match(f.err.join("\n"), new RegExp(`under ${kept}:`));
});
