// merge <feat>
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { i4b0709b1f9bf587aa8452f900544321e as jump } from "./i4b0709b1f9bf587aa8452f900544321e.ts";
import { i04e4ffac39275048813909fc5fd2e202 as land } from "./i04e4ffac39275048813909fc5fd2e202.ts";
import { ic5b0c0d5fa525fcab3d57e72cd3cde83 as merge } from "./ic5b0c0d5fa525fcab3d57e72cd3cde83.ts";
import { fixture, git } from "../test/harness.ts";

test("refuses while a dive is open, then fast-forwards trunk to the work branch and deletes it", async () => {
	const f = fixture("merge");
	await jump({ ref: f.featId }, f.ctx);
	const head = f.commit("idea.md", "an idea\n");
	await assert.rejects(merge({ feat: f.featId }, f.ctx), /ideas has open dives, so nothing was merged: ideas\.\w{6}/);
	await land({}, f.ctx);

	await merge({ feat: f.featId }, f.ctx);
	assert.equal(f.remoteRef("refs/heads/main"), head);
	assert.equal(f.remoteRef("refs/heads/work/ideas"), "", "the branch is gone");
	assert.match(f.doc(f.featId), /\n## Merged \S+\n\n- data: work\/ideas fast-forwarded main at \w{7}\n$/);
	assert.equal(git(f.ship, "log", "-1", "--format=%s"), "merge(ideas): work branches merged into trunk");
});

test("makes a merge commit when trunk moved, and pushes nothing on a conflict", async () => {
	const f = fixture("merge-commit");
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	await land({}, f.ctx);
	const other = join(f.ship, "..", "other");
	git(f.ship, "clone", "-q", f.remote, other);
	git(other, "-c", "user.name=O", "-c", "user.email=o@example.com", "commit", "-q", "--allow-empty", "-m", "trunk moved");
	git(other, "push", "-q", "origin", "HEAD:refs/heads/main");
	const moved = git(other, "rev-parse", "HEAD");

	await merge({ feat: f.featId }, f.ctx);
	const main = f.remoteRef("refs/heads/main");
	assert.equal(f.remoteRef("refs/heads/main^1"), moved);
	assert.equal(git(f.remote, "log", "-1", "--format=%s", main), "merge work/ideas into main");
	assert.match(f.doc(f.featId), /- data: work\/ideas merged main at \w{7}\n$/);
});

test("refuses a conflict before pushing anything", async () => {
	const f = fixture("merge-conflict");
	await jump({ ref: f.featId }, f.ctx);
	f.commit("README.md", "ours\n");
	await land({}, f.ctx);
	const other = join(f.ship, "..", "other");
	git(f.ship, "clone", "-q", f.remote, other);
	writeFileSync(join(other, "README.md"), "theirs\n");
	git(other, "-c", "user.name=O", "-c", "user.email=o@example.com", "commit", "-qam", "theirs");
	git(other, "push", "-q", "origin", "HEAD:refs/heads/main");
	const main = f.remoteRef("refs/heads/main");
	await assert.rejects(merge({ feat: f.featId }, f.ctx), /nothing was merged:\n {2}work\/ideas conflicts with main in data: README\.md/);
	assert.equal(f.remoteRef("refs/heads/main"), main);
	assert.notEqual(f.remoteRef("refs/heads/work/ideas"), "");
});
