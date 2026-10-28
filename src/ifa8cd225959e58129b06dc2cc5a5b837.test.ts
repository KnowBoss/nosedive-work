// bail --reason <why>
import assert from "node:assert/strict";
import { test } from "node:test";
import { i4b0709b1f9bf587aa8452f900544321e as jump } from "./i4b0709b1f9bf587aa8452f900544321e.ts";
import { idae870d5677552668a3496e880920f3f as pack } from "./idae870d5677552668a3496e880920f3f.ts";
import { ifa8cd225959e58129b06dc2cc5a5b837 as bail } from "./ifa8cd225959e58129b06dc2cc5a5b837.ts";
import { fixture, git } from "../test/harness.ts";

test("keeps what the dive held on an orphan ref, records why, deletes its refs and branch, leaves the checkout at its base, and ends it", async () => {
	const f = fixture("bail");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const base = git(f.checkout, "rev-parse", "HEAD");
	f.commit("idea.md", "an idea\n");
	await pack({}, f.ctx);
	await jump({ ref: id }, f.ctx);
	const head = git(f.checkout, "rev-parse", "HEAD");
	const short = git(f.checkout, "rev-parse", "--short", "HEAD");

	await bail({ why: "a better idea came along" }, f.ctx);
	const orphan = `refs/nosedive/orphans/${f.heroId}/main/${head}`;
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), base);
	assert.equal(f.remoteRef(orphan), head, "nothing it held is lost");
	assert.equal(git(f.remote, "for-each-ref", "refs/nosedive/dives"), "", "the dive's ref is gone");
	assert.equal(git(f.checkout, "branch", "--list", `*/${id}`), "", "its branch is gone");
	const doc = f.doc(id);
	assert.match(doc, /\nmeta:\n {2}feat: [0-9a-f-]{36}\n {2}outcome: bailed\n/);
	assert.match(doc, new RegExp(`\\n## Bailed \\S+\\n\\ndiver@example\\.com bailed: a better idea came along\\n\\n- data: held ${short} add idea\\.md, kept on ${orphan}\\n$`));
	assert.throws(() => f.onDeck());
	await assert.rejects(jump({ ref: id }, f.ctx), /is over: it bailed/);
});

test("needs a reason", async () => {
	const f = fixture("bail-reason");
	await assert.rejects(bail({ why: " " }, f.ctx), /bail needs a reason/);
});
