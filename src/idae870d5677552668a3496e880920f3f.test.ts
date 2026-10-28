// pack
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { i4b0709b1f9bf587aa8452f900544321e as jump } from "./i4b0709b1f9bf587aa8452f900544321e.ts";
import { idae870d5677552668a3496e880920f3f as pack } from "./idae870d5677552668a3496e880920f3f.ts";
import { fixture, git } from "../test/harness.ts";

test("keeps the work on the dive's ref, uncommitted changes and all, packs ignored files for the feat, puts the checkout away, and the next jump brings it all back", async () => {
	const f = fixture("pack");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	writeFileSync(join(f.checkout, ".gitignore"), ".env\nnode_modules/\n");
	const committed = f.commit("idea.md", "an idea\n");
	writeFileSync(join(f.checkout, "draft.md"), "half a thought\n");
	writeFileSync(join(f.checkout, "README.md"), "data, edited\n");
	writeFileSync(join(f.checkout, ".env"), "KEY=secret\n");
	mkdirSync(join(f.checkout, "node_modules"));
	writeFileSync(join(f.checkout, "node_modules", "dep.js"), "remade by an install\n");

	await pack({}, f.ctx);
	const ref = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	assert.equal(existsSync(f.checkout), false, "the checkout is put away");
	assert.equal(f.remoteRef(`${ref}^`), committed, "the ref holds the commit, then the uncommitted work");
	assert.equal(git(f.remote, "for-each-ref", "refs/heads"), git(f.remote, "for-each-ref", "refs/heads/main"), "no branch was made");
	assert.equal(existsSync(join(f.hero, ".nosedive", "local", "packs", f.featId, "data.zip")), true);
	assert.throws(() => f.onDeck(), "nothing is on deck");
	const doc = f.doc(id);
	assert.match(doc, /\nmeta:\n {2}feat: [0-9a-f-]{36}\n {2}packer: diver@example\.com\n/);
	assert.match(doc, new RegExp(`\\n## Packed \\S+\\n\\ndiver@example\\.com put it down\\.\\n\\n- data: 2 commits kept on ${ref} at \\w+\\n- data: 1 ignored file packed for the feat\\n$`));

	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), committed);
	assert.equal(readFileSync(join(f.checkout, "draft.md"), "utf8"), "half a thought\n");
	assert.equal(git(f.checkout, "status", "--porcelain"), "M README.md\n?? draft.md", "uncommitted again");
	assert.equal(readFileSync(join(f.checkout, ".env"), "utf8"), "KEY=secret\n", "the feat's ignored files come back");
	assert.equal(existsSync(join(f.checkout, "node_modules")), false, "what an install remakes is not packed");
	assert.doesNotMatch(f.doc(id), /packer:/);
});

test("refuses work in a read-only scope", async () => {
	const f = fixture("pack-readonly", { readOnly: true });
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	await assert.rejects(pack({}, f.ctx), /read-only scopes hold work with nowhere to go, so nothing was packed:\n {2}data is read-only, yet has commits origin lacks/);
	assert.equal(f.onDeck().length, 36, "still on deck");
});
