// pack [<dive>]
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { i0735c57383365d4ca5395ea24f5b0649 as pack } from "./i0735c57383365d4ca5395ea24f5b0649.ts";
import { fixture, git } from "../test/harness.ts";

test("keeps the work on the dive's ref, uncommitted changes and all, packs ignored files for the feat, leaves the checkout at its base, and the next jump brings it all back", async () => {
	const f = fixture("pack");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const base = git(f.checkout, "rev-parse", "HEAD");
	writeFileSync(join(f.checkout, ".gitignore"), "secrets.local\nnode_modules/\n");
	const committed = f.commit("idea.md", "an idea\n");
	writeFileSync(join(f.checkout, "draft.md"), "half a thought\n");
	writeFileSync(join(f.checkout, "README.md"), "data, edited\n");
	writeFileSync(join(f.checkout, "secrets.local"), "KEY=secret\n");
	mkdirSync(join(f.checkout, "node_modules"));
	writeFileSync(join(f.checkout, "node_modules", "dep.js"), "remade by an install\n");

	await pack({}, f.ctx);
	const ref = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	const tip = f.remoteRef(ref);
	assert.equal(f.remoteRef(`${ref}^`), committed, "the ref holds the commit, then the uncommitted work");
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), base, "the checkout sits at its base");
	assert.equal(spawnSync("git", ["symbolic-ref", "-q", "HEAD"], { cwd: f.checkout }).status, 1, "detached");
	assert.equal(git(f.checkout, "branch", "--list", `*/${id}`), "", "its branch is gone");
	assert.equal(existsSync(join(f.checkout, "secrets.local")), false, "ignored files the base does not ignore are cleared, the pack holding them");
	assert.equal(existsSync(join(f.checkout, "node_modules")), false);
	assert.equal(git(f.remote, "for-each-ref", "refs/heads"), git(f.remote, "for-each-ref", "refs/heads/main"), "no branch was made");
	assert.equal(existsSync(join(f.hero, ".nosedive", "local", "packs", f.featId, "data.zip")), true);
	assert.throws(() => f.onDeck(), "nothing is held");
	const doc = f.doc(id);
	assert.match(doc, new RegExp(`scopes:\\n {2}- ${f.repoId}:\\n {6}work-branch: work/ideas\\n {6}ref: ${tip}\\n`));
	assert.match(doc, /\nmeta:\n {2}feat: [0-9a-f-]{36}\n {2}packer: diver@example\.com\n/);
	assert.match(doc, new RegExp(`\\n## Packed \\S+\\n\\ndiver@example\\.com put it down\\.\\n\\n- data: 2 commits kept on ${ref} at \\w+\\n- hero: no work\\n$`));
	assert.equal(git(f.hero, "rev-parse", "HEAD"), git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0], "the record is on trunk");

	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), committed);
	assert.equal(readFileSync(join(f.checkout, "draft.md"), "utf8"), "half a thought\n");
	assert.equal(git(f.checkout, "status", "--porcelain"), "M README.md\n?? draft.md", "uncommitted again");
	assert.equal(readFileSync(join(f.checkout, "secrets.local"), "utf8"), "KEY=secret\n", "the feat's ignored files are back");
	assert.doesNotMatch(f.doc(id), /packer:/);
});

test("refuses when the dive's ref moved since it was jumped, pushing nothing", async () => {
	const f = fixture("pack-lease");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	f.commit("idea.md", "an idea\n");
	const other = join(f.hero, "..", "other");
	git(f.hero, "clone", "-q", f.remote, other);
	git(other, "-c", "user.name=O", "-c", "user.email=o@example.com", "commit", "-q", "--allow-empty", "-m", "theirs");
	git(other, "push", "-q", "origin", `HEAD:refs/nosedive/dives/elsewhere/main/${id}`);
	await assert.rejects(pack({}, f.ctx), new RegExp(`the dive's refs moved under it, so nothing was put down:\\n {2}data: refs/nosedive/dives/elsewhere/main/${id} is at \\w{7}, which this dive did not see`));
	assert.equal(f.remoteRef(`refs/nosedive/dives/${f.heroId}/main/${id}`), "", "nothing pushed");
	assert.equal(f.onDeck(), id, "still held");
});

test("refuses work in a read-only scope", async () => {
	const f = fixture("pack-readonly", { readOnly: true });
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	await assert.rejects(pack({}, f.ctx), /read-only scopes hold work with nowhere to go, so nothing was packed:\n {2}data is read-only, yet has commits origin lacks/);
	assert.equal(f.onDeck().length, 36, "still held");
});
