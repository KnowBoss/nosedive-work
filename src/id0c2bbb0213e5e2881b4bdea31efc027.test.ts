// jump [<ref>] --sure
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { id0c2bbb0213e5e2881b4bdea31efc027 as jumpSure } from "./id0c2bbb0213e5e2881b4bdea31efc027.ts";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { i0735c57383365d4ca5395ea24f5b0649 as pack } from "./i0735c57383365d4ca5395ea24f5b0649.ts";
import { i2bcf8d7ee2645df5b261ee1b2135d190 as land } from "./i2bcf8d7ee2645df5b261ee1b2135d190.ts";
import { fixture, git } from "../test/harness.ts";

test("a durable feat is jumped only --sure", async () => {
	const f = fixture("sure-durable");
	// The memo kind made durable again: its doc no longer says how one is dropped.
	const kind = git(f.hero, "ls-files", ".nosedive/kinds").split("\n")[0]!;
	writeFileSync(join(f.hero, kind), readFileSync(join(f.hero, kind), "utf8").replace(/\n## Drop when\n[^]*$/, "\n"));
	git(f.hero, "commit", "-qam", "memos last");
	git(f.hero, "push", "-q", "origin", "HEAD:main");
	await assert.rejects(jump({ ref: f.featId }, f.ctx), /ideas is durable, so next does not list it: jump it --sure to start a dive on it anyway \(sure-off-fringe\)/);
	await jumpSure({ ref: f.featId }, f.ctx);
	assert.match(f.doc(f.onDeck()), /\n {2}feat: /);
});

test("a feat already dived is no leaf, so a new attempt on it is started --sure", async () => {
	const f = fixture("sure-attempt");
	await jump({ ref: f.featId }, f.ctx);
	const first = f.onDeck();
	await pack({}, f.ctx);
	await assert.rejects(jump({ ref: f.featId }, f.ctx), /ideas has 1 child doc, dives included, so it is no leaf, so next does not list it: jump it --sure/);
	await jumpSure({ ref: f.featId }, f.ctx);
	const second = f.onDeck();
	assert.notEqual(second, first, "a second dive on the feat, beside the packed one");
	await land({}, f.ctx);
	await jump({ ref: first }, f.ctx);
	assert.equal(f.onDeck(), first, "the packed one is jumped again by its packer, no --sure needed");
});

test("work another email packed is taken over only --sure, its work in progress included", async () => {
	const f = fixture("sure-take-over");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	writeFileSync(join(f.checkout, "half.md"), "half done\n");
	await pack({}, f.ctx);

	git(f.hero, "config", "user.email", "taker@example.com");
	await assert.rejects(jump({ ref: id }, f.ctx), new RegExp(`dive ideas\\.${id.slice(-6)} was packed by diver@example\\.com: jump it --sure to take it over, its work in progress included \\(take-over-with-sure\\)`));
	await jumpSure({ ref: id }, f.ctx);
	assert.equal(f.onDeck(), id);
	assert.equal(readFileSync(join(f.checkout, "half.md"), "utf8"), "half done\n", "their work in progress, uncommitted again");
	assert.match(f.doc(id), /\n {2}diver: taker@example\.com#[0-9a-f]{12}\n/);
});
