// jump <ref>
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { i4b0709b1f9bf587aa8452f900544321e as jump } from "./i4b0709b1f9bf587aa8452f900544321e.ts";
import { idae870d5677552668a3496e880920f3f as pack } from "./idae870d5677552668a3496e880920f3f.ts";
import { fixture, git } from "../test/harness.ts";

test("a feat the root reaches gets a dive, pinned at trunk while its work branch is missing, naming the feat and linked from it as dives.feat, held and on deck", async () => {
	const f = fixture("jump-feat");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const dive = f.doc(id);
	const trunk = git(f.remote, "rev-parse", "main");
	assert.match(dive, new RegExp(`^---\\nkind: dive\\nid: ${id}\\nname: ideas\\.${id.slice(-6)}\\n`));
	assert.match(dive, new RegExp(`scopes:\\n {2}- ${f.repoId}:\\n {6}work-branch: work/ideas\\n {6}pin: ${trunk}\\n`));
	assert.match(dive, new RegExp(`\\nmeta:\\n {2}feat: ${f.featId}\\n {2}diver: diver@example\\.com\\n`));
	assert.doesNotMatch(dive, /\nlinks:/, "a dive links nothing back");
	assert.match(dive, /\n## Jumped \S+\n\ndiver@example\.com picked it up\.\n\n- data: workspace\/data on \w+, pinned at \w{7}, working work\/ideas\n$/);
	assert.match(f.doc(f.featId), new RegExp(`- kb/${id}\\.md:\\n {6}rel: dives\\.feat\\n`));
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), trunk);
	assert.equal(git(f.ship, "log", "-1", "--format=%s"), `jump(ideas.${id.slice(-6)}): diver@example.com picked it up`);
	assert.equal(git(f.ship, "status", "--porcelain"), "", "the feat's link rides the same commit");
	assert.equal(git(f.ship, "rev-parse", "HEAD"), git(f.ship, "rev-parse", "origin/main"), "the ship is pushed");
	assert.deepEqual(f.out.slice(-3), [`dive  kb/${id}.md`, `feat  kb/${f.featId}.md`, "data  workspace/data"]);
});

test("refuses a second dive while one is on deck, a doc that is neither feat nor dive, and someone else's dive", async () => {
	const f = fixture("jump-refusals");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	await assert.rejects(jump({ ref: f.featId }, f.ctx), new RegExp(`dive ${id} is on deck: pack, bail or land it first`));
	await assert.rejects(jump({ ref: f.repoId }, f.ctx), /data is no feat: nothing reaches it from a deck root of the ship through a .feat link; link it from a feat first/);
	git(f.ship, "config", "user.email", "other@example.com");
	await assert.rejects(jump({ ref: id }, f.ctx), new RegExp(`dive ideas\\.${id.slice(-6)} is held by diver@example\\.com`));
	git(f.ship, "config", "user.email", "diver@example.com");
	await jump({ ref: id }, f.ctx);
	assert.equal(f.onDeck(), id, "jumping the dive on deck jumps it again");
});

test("picks packed work up on its branch's new tip, moving the pin, and refuses to strand unpublished commits", async () => {
	const f = fixture("jump-rebase");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	f.commit("idea.md", "mine\n");
	await pack({}, f.ctx);

	// Someone else lands on the work branch meanwhile.
	const other = join(f.ship, "..", "other");
	git(f.ship, "clone", "-q", f.remote, other);
	writeFileSync(join(other, "theirs.md"), "theirs\n");
	git(other, "add", "-A");
	git(other, "-c", "user.name=O", "-c", "user.email=o@example.com", "commit", "-q", "-m", "theirs");
	git(other, "push", "-q", "origin", "HEAD:refs/heads/work/ideas");
	const tip = git(other, "rev-parse", "HEAD");

	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD^"), tip, "the work sits on the branch's tip");
	assert.equal(git(f.checkout, "log", "-1", "--format=%s"), "add idea.md");
	assert.match(f.doc(id), new RegExp(`pin: ${tip}\\n`));

	await pack({}, f.ctx);
	git(f.checkout, "checkout", "-q", "--detach", tip);
	f.commit("stray.md", "stray\n");
	await assert.rejects(jump({ ref: id }, f.ctx), /jump would lose work, so nothing moved:\n {2}workspace\/data is on \w+, which no ref holds/);
});

test("a feat on a ship's second deck gets its dive in that deck, its repo registered in the bridge, and packs and jumps again", async () => {
	const f = fixture("jump-decks", { decks: true });
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	assert.match(f.doc(id), /^---\nkind: dive\n/, "minted beside its feat in ./docs");
	assert.match(f.doc(f.featId), new RegExp(`- docs/${id}\.md:\n {6}rel: dives\.feat\n`));
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), git(f.remote, "rev-parse", "main"));
	await pack({}, f.ctx);
	await jump({ ref: id }, f.ctx);
	assert.equal(f.onDeck(), id);
	assert.equal(git(f.ship, "status", "--porcelain"), "");
});
