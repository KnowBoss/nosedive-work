// land
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { i4b0709b1f9bf587aa8452f900544321e as jump } from "./i4b0709b1f9bf587aa8452f900544321e.ts";
import { idae870d5677552668a3496e880920f3f as pack } from "./idae870d5677552668a3496e880920f3f.ts";
import { i04e4ffac39275048813909fc5fd2e202 as land } from "./i04e4ffac39275048813909fc5fd2e202.ts";
import { fixture, git } from "../test/harness.ts";

test("pushes the work to its feat's branch, deletes the dive's ref, and ends the dive; the next dive starts there", async () => {
	const f = fixture("land");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	f.commit("idea.md", "an idea\n");
	await pack({}, f.ctx);
	await jump({ ref: id }, f.ctx);
	const head = git(f.checkout, "rev-parse", "HEAD");

	await land({}, f.ctx);
	assert.equal(f.remoteRef("refs/heads/work/ideas"), head);
	assert.equal(f.remoteRef(`refs/nosedive/dives/${id}`), "");
	assert.equal(f.remoteRef("refs/heads/main"), git(f.remote, "rev-parse", "main"), "trunk is untouched");
	assert.match(f.doc(id), new RegExp(`\\nmeta:\\n {2}feat: [0-9a-f-]{36}\\n {2}outcome: landed\\n[^]*\\n## Landed \\S+\\n\\ndiver@example\\.com landed it\\.\\n\\n- data: pushed ${head.slice(0, 7)} to work/ideas\\n$`));
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), head, "the checkout stays at what it pushed");

	await jump({ ref: f.featId }, f.ctx);
	assert.match(f.doc(f.onDeck()), new RegExp(`pin: ${head}\\n`), "a feat's dives stack on its branch");
});

test("refuses uncommitted changes, and a branch that moved past the work", async () => {
	const f = fixture("land-refusals");
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	writeFileSync(join(f.checkout, "draft.md"), "draft\n");
	await assert.rejects(land({}, f.ctx), /nothing was landed:\n {2}workspace\/data has uncommitted changes: commit them first/);
	git(f.checkout, "clean", "-qf");

	const other = join(f.ship, "..", "other");
	git(f.ship, "clone", "-q", f.remote, other);
	git(other, "-c", "user.name=O", "-c", "user.email=o@example.com", "commit", "-q", "--allow-empty", "-m", "theirs");
	git(other, "push", "-q", "origin", "HEAD:refs/heads/work/ideas");
	await assert.rejects(land({}, f.ctx), new RegExp(`work/ideas in data has moved to \\w{7}, which this dive's work does not contain: pack, then jump ${f.onDeck()}`));
	assert.equal(f.remoteRef("refs/heads/work/ideas"), git(other, "rev-parse", "HEAD"));
});
