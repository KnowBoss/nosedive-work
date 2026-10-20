// bail --reason <why>
import assert from "node:assert/strict";
import { test } from "node:test";
import { i4b0709b1f9bf587aa8452f900544321e as jump } from "./i4b0709b1f9bf587aa8452f900544321e.ts";
import { idae870d5677552668a3496e880920f3f as pack } from "./idae870d5677552668a3496e880920f3f.ts";
import { ifa8cd225959e58129b06dc2cc5a5b837 as bail } from "./ifa8cd225959e58129b06dc2cc5a5b837.ts";
import { fixture, git } from "../test/harness.ts";

test("records why and what the dive held, deletes its ref, and ends it", async () => {
	const f = fixture("bail");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const pin = git(f.checkout, "rev-parse", "HEAD");
	f.commit("idea.md", "an idea\n");
	await pack({}, f.ctx);
	await jump({ ref: id }, f.ctx);
	const short = git(f.checkout, "rev-parse", "--short", "HEAD");

	await bail({ why: "a better idea came along" }, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), pin);
	assert.equal(f.remoteRef(`refs/nosedive/dives/${id}`), "", "the ref is gone");
	const doc = f.doc(id);
	assert.match(doc, /\nmeta:\n {2}outcome: bailed\n/);
	assert.match(doc, new RegExp(`\\n## Bailed \\S+\\n\\ndiver@example\\.com bailed: a better idea came along\\n\\n- data: held ${short} add idea\\.md\\n$`));
	assert.throws(() => f.onDeck());
	await assert.rejects(jump({ ref: id }, f.ctx), /is over: it bailed/);
});

test("needs a reason", async () => {
	const f = fixture("bail-reason");
	await assert.rejects(bail({ why: " " }, f.ctx), /bail needs a reason/);
});
