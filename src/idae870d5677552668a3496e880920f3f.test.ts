// pack
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { i4b0709b1f9bf587aa8452f900544321e as jump } from "./i4b0709b1f9bf587aa8452f900544321e.ts";
import { idae870d5677552668a3496e880920f3f as pack } from "./idae870d5677552668a3496e880920f3f.ts";
import { fixture, git } from "../test/harness.ts";

test("keeps the work on the dive's ref, uncommitted changes and all, and the next jump brings it back as it was", async () => {
	const f = fixture("pack");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const pin = git(f.checkout, "rev-parse", "HEAD");
	const committed = f.commit("idea.md", "an idea\n");
	writeFileSync(join(f.checkout, "draft.md"), "half a thought\n");
	writeFileSync(join(f.checkout, "README.md"), "data, edited\n");

	await pack({}, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), pin, "the checkout is back at its pin");
	assert.equal(existsSync(join(f.checkout, "draft.md")), false);
	assert.equal(f.remoteRef(`refs/nosedive/dives/${id}^`), committed, "the ref holds the commit, then the uncommitted work");
	assert.equal(git(f.remote, "for-each-ref", "refs/heads"), git(f.remote, "for-each-ref", "refs/heads/main"), "no branch was made");
	assert.throws(() => f.onDeck(), "nothing is on deck");
	const doc = f.doc(id);
	assert.match(doc, /\nmeta:\n {2}packer: diver@example\.com\n/);
	assert.match(doc, /\n## Packed \S+\n\ndiver@example\.com put it down\.\n\n- data: 2 commits past \w{7}, kept at \w{7}\n$/);

	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), committed);
	assert.equal(readFileSync(join(f.checkout, "draft.md"), "utf8"), "half a thought\n");
	assert.equal(git(f.checkout, "status", "--porcelain"), "M README.md\n?? draft.md", "uncommitted again");
	assert.doesNotMatch(f.doc(id), /packer:/);
});

test("refuses work in a read-only scope", async () => {
	const f = fixture("pack-readonly", { readOnly: true });
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	await assert.rejects(pack({}, f.ctx), /read-only scopes hold work with nowhere to go, so nothing was packed:\n {2}data is read-only, yet has commits past its pin/);
	assert.equal(f.onDeck().length, 36, "still on deck");
});
