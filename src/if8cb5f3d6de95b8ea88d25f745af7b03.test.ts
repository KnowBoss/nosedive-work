// jump [<ref>]
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { i0735c57383365d4ca5395ea24f5b0649 as pack } from "./i0735c57383365d4ca5395ea24f5b0649.ts";
import { i2bcf8d7ee2645df5b261ee1b2135d190 as land } from "./i2bcf8d7ee2645df5b261ee1b2135d190.ts";
import { fixture, git } from "../test/harness.ts";

test("a feat the root reaches gets a dive with its scopes, naming the feat and linked from it as dives.feat, checked out on its branch, held by this checkout, its bookkeeping on trunk", async () => {
	const f = fixture("jump-feat");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const dive = f.doc(id);
	const trunk = git(f.remote, "rev-parse", "main");
	assert.match(dive, new RegExp(`^---\\nkind: dive\\nid: ${id}\\nname: ideas\\.${id.slice(-6)}\\n`));
	assert.match(dive, new RegExp(`scopes:\\n {2}- ${f.repoId}:\\n {6}work-branch: work/ideas\\n`));
	assert.match(dive, new RegExp(`\\nmeta:\\n {2}feat: ${f.featId}\\n {2}diver: diver@example\\.com#[0-9a-f]{12}\\n`));
	assert.doesNotMatch(dive, /\nlinks:/, "a dive links nothing back");
	assert.match(dive, /\n## Jumped \S+\n\ndiver@example\.com picked it up\.\n\n- data: workspace\/data on \w+, working work\/ideas\n$/);
	assert.match(f.doc(f.featId), new RegExp(`- kb/${id}\\.md:\\n {6}rel: dives\\.feat\\n`));
	assert.equal(git(f.checkout, "symbolic-ref", "--short", "HEAD"), `${f.heroId}/main/${id}`);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), trunk, "with no work branch yet, it starts at trunk");
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), `jump(ideas.${id.slice(-6)}): diver@example.com picked it up`);
	assert.equal(git(f.hero, "status", "--porcelain"), "", "the feat's link rides the same commit");
	assert.equal(git(f.hero, "rev-parse", "HEAD"), git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0], "the bookkeeping is on trunk");
	assert.deepEqual(f.out.slice(-3), [`dive  kb/${id}.md`, `feat  kb/${f.featId}.md`, "data  workspace/data"]);
});

test("refuses a second dive while this checkout holds one, a doc that is neither feat nor dive, and a dive another checkout holds; jumping the held dive again records nothing", async () => {
	const f = fixture("jump-refusals");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	await assert.rejects(jump({ ref: f.featId }, f.ctx), new RegExp(`this checkout of the hero holds dive ideas\\.${id.slice(-6)} \\(${id}\\): pack, bail or land it first`));
	await assert.rejects(jump({ ref: f.repoId }, f.ctx), /data is no feat: nothing reaches it from a root of the hero through a .feat link; link it from a feat first/);

	const other = join(f.hero, "..", "other-checkout");
	git(f.hero, "worktree", "add", "-q", "-b", "other", other, "HEAD");
	await assert.rejects(jump({ ref: id }, { ...f.ctx, cwd: other }), new RegExp(`dive ideas\\.${id.slice(-6)} is held by diver@example\\.com in another checkout of the hero`));
	git(f.hero, "config", "user.email", "other@example.com");
	await assert.rejects(jump({ ref: id }, f.ctx), new RegExp(`dive ideas\\.${id.slice(-6)} is held by diver@example\\.com$`));
	git(f.hero, "config", "user.email", "diver@example.com");

	const before = git(f.hero, "rev-parse", "HEAD");
	writeFileSync(join(f.checkout, "draft.md"), "mine\n");
	await jump({}, f.ctx);
	assert.equal(git(f.hero, "rev-parse", "HEAD"), before, "nothing recorded");
	assert.equal(git(f.checkout, "status", "--porcelain"), "?? draft.md", "its checkout is the diver's to change");
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

test("replays the dive's hero work on its bookkeeping, and refuses while the hero holds commits trunk lacks", async () => {
	const f = fixture("jump-hero");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	writeFileSync(join(f.hero, "kb", "note.md"), "a note\n");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-q", "-m", "a note");
	writeFileSync(join(f.hero, "kb", "draft.md"), "half\n");
	await pack({}, f.ctx);
	assert.equal(existsSync(join(f.hero, "kb", "note.md")), false, "the hero is back at trunk");

	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), "a note");
	assert.equal(git(f.hero, "log", "-1", "--format=%s", "HEAD^"), `jump(ideas.${id.slice(-6)}): diver@example.com picked it up`);
	assert.equal(git(f.hero, "status", "--porcelain"), "?? kb/draft.md", "uncommitted again");
	assert.match(f.doc(id), /\n- hero: 2 commits replayed\n$/);

	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-q", "-m", "a draft");
	await land({}, f.ctx);
	git(f.hero, "commit", "-q", "--allow-empty", "-m", "stray");
	await assert.rejects(jump({ ref: f.featId }, f.ctx), /jump would lose work, so nothing moved:\n {2}the hero holds 1 commit main lacks/);
});

test("moves a checkout left from other work, keeping commits origin lacks on an orphan ref, and refuses one with uncommitted changes", async () => {
	const f = fixture("jump-orphan");
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	await land({}, f.ctx);
	const stray = f.commit("stray.md", "stray\n");

	writeFileSync(join(f.checkout, "draft.md"), "draft\n");
	await assert.rejects(jump({ ref: f.featId }, f.ctx), /jump would lose work, so nothing moved:\n {2}workspace\/data has uncommitted changes or untracked files/);
	git(f.checkout, "clean", "-qf");

	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	assert.equal(f.remoteRef(`refs/nosedive/orphans/${f.heroId}/main/${stray}`), stray);
	assert.equal(git(f.checkout, "symbolic-ref", "--short", "HEAD"), `${f.heroId}/main/${id}`);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), f.remoteRef("refs/heads/work/ideas"), "a feat's dives stack on its work branch");
	assert.match(f.doc(id), new RegExp(`; its 1 commit origin lacked kept on refs/nosedive/orphans/${f.heroId}/main/${stray}\\n$`));
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
