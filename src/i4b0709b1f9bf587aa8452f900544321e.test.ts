// jump <ref>
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { i4b0709b1f9bf587aa8452f900544321e as jump } from "./i4b0709b1f9bf587aa8452f900544321e.ts";
import { idae870d5677552668a3496e880920f3f as pack } from "./idae870d5677552668a3496e880920f3f.ts";
import { i04e4ffac39275048813909fc5fd2e202 as land } from "./i04e4ffac39275048813909fc5fd2e202.ts";
import { fixture, git } from "../test/harness.ts";

test("a feat the root reaches gets a dive with its scopes, naming the feat and linked from it as dives.feat, checked out on its branch, held and on deck", async () => {
	const f = fixture("jump-feat");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const dive = f.doc(id);
	const trunk = git(f.remote, "rev-parse", "main");
	assert.match(dive, new RegExp(`^---\\nkind: dive\\nid: ${id}\\nname: ideas\\.${id.slice(-6)}\\n`));
	assert.match(dive, new RegExp(`scopes:\\n {2}- ${f.repoId}:\\n {6}work-branch: work/ideas\\n`));
	assert.doesNotMatch(dive, /pin:/);
	assert.match(dive, new RegExp(`\\nmeta:\\n {2}feat: ${f.featId}\\n {2}diver: diver@example\\.com\\n`));
	assert.doesNotMatch(dive, /\nlinks:/, "a dive links nothing back");
	assert.match(dive, /\n## Jumped \S+\n\ndiver@example\.com picked it up\.\n\n- data: workspace\/data on \w+, working work\/ideas\n$/);
	assert.match(f.doc(f.featId), new RegExp(`- kb/${id}\\.md:\\n {6}rel: dives\\.feat\\n`));
	assert.equal(git(f.checkout, "symbolic-ref", "--short", "HEAD"), `${f.heroId}/main/${id}`);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), trunk, "with no work branch yet, it starts at trunk");
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), `jump(ideas.${id.slice(-6)}): diver@example.com picked it up`);
	assert.equal(git(f.hero, "status", "--porcelain"), "", "the feat's link rides the same commit");
	assert.equal(git(f.hero, "rev-parse", "HEAD"), git(f.hero, "rev-parse", "origin/main"), "the hero is pushed");
	assert.deepEqual(f.out.slice(-3), [`dive  kb/${id}.md`, `feat  kb/${f.featId}.md`, "data  workspace/data"]);
});

test("refuses a second dive while one is on deck, a doc that is neither feat nor dive, and someone else's dive", async () => {
	const f = fixture("jump-refusals");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	await assert.rejects(jump({ ref: f.featId }, f.ctx), new RegExp(`dive ${id} is on deck: pack, bail or land it first`));
	await assert.rejects(jump({ ref: f.repoId }, f.ctx), /data is no feat: nothing reaches it from a root of the hero through a .feat link; link it from a feat first/);
	git(f.hero, "config", "user.email", "other@example.com");
	await assert.rejects(jump({ ref: id }, f.ctx), new RegExp(`dive ideas\\.${id.slice(-6)} is held by diver@example\\.com`));
	git(f.hero, "config", "user.email", "diver@example.com");
	writeFileSync(join(f.checkout, "draft.md"), "mine\n");
	await jump({ ref: id }, f.ctx);
	assert.equal(f.onDeck(), id, "jumping the dive on deck jumps it again, its checkout the diver's to change");
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

test("a feat under a hero's second root gets its dive in that root's directory, its repo registered in .nosedive/repos, and packs and jumps again", async () => {
	const f = fixture("jump-roots", { roots: true });
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	assert.match(f.doc(id), /^---\nkind: dive\n/, "minted beside its feat in ./docs");
	assert.match(f.doc(f.featId), new RegExp(`- docs/${id}\.md:\n {6}rel: dives\.feat\n`));
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), git(f.remote, "rev-parse", "main"));
	await pack({}, f.ctx);
	await jump({ ref: id }, f.ctx);
	assert.equal(f.onDeck(), id);
	assert.equal(git(f.hero, "status", "--porcelain"), "");
});
