// jump [<ref>] --from <branch>
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { if07eaf125fca594bb3c945f203e164ad as jumpFrom } from "./if07eaf125fca594bb3c945f203e164ad.ts";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { i0735c57383365d4ca5395ea24f5b0649 as pack } from "./i0735c57383365d4ca5395ea24f5b0649.ts";
import { i2bcf8d7ee2645df5b261ee1b2135d190 as land } from "./i2bcf8d7ee2645df5b261ee1b2135d190.ts";
import { iffc777778a63553ba90babcc038eb748 as bail } from "./iffc777778a63553ba90babcc038eb748.ts";
import { fixture, git } from "../test/harness.ts";

/** The hero on a local branch `spec` one commit past trunk, as a spec pull request's branch is; returns trunk on origin. */
function onSpec(f: ReturnType<typeof fixture>): string {
	const trunk = git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0]!;
	git(f.hero, "switch", "-q", "-c", "spec");
	writeFileSync(join(f.hero, "SPEC.md"), "the spec\n");
	git(f.hero, "add", "SPEC.md");
	git(f.hero, "commit", "-q", "-m", "spec");
	return trunk;
}

const originMain = (f: ReturnType<typeof fixture>) => git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0];

test("jumps a feat against a local branch: the dive records it, its bookkeeping moves that branch, the hero sits detached there, and trunk on origin is untouched", async () => {
	const f = fixture("jump-from");
	const trunk = onSpec(f);
	const spec = git(f.hero, "rev-parse", "spec");
	await jumpFrom({ ref: f.featId, from: "spec" }, f.ctx);
	const id = f.onDeck();
	assert.match(f.doc(id), /\n {2}from: spec\n/, "the dive records its base");
	assert.equal(originMain(f), trunk, "nothing reached trunk");
	assert.equal(git(f.hero, "rev-parse", "spec^"), spec, "the bookkeeping is one commit on top of the branch");
	assert.match(git(f.hero, "log", "-1", "--format=%s", "spec"), /^jump\(ideas\.[0-9a-f]{6}\): diver@example\.com picked it up$/);
	assert.equal(git(f.hero, "rev-parse", "HEAD"), git(f.hero, "rev-parse", "spec"));
	assert.equal(git(f.hero, "symbolic-ref", "-q", "HEAD", "--short").trim(), "", "detached, so its own work stays apart from the branch");
});

test("packs, jumps again from the recorded branch and lands onto it, the hero's work riding it, and never pushes trunk", async () => {
	const f = fixture("jump-from-loop");
	const trunk = onSpec(f);
	await jumpFrom({ ref: f.featId, from: "spec" }, f.ctx);
	const id = f.onDeck();
	writeFileSync(join(f.hero, "NOTE.md"), "hero work\n");
	git(f.hero, "add", "NOTE.md");
	git(f.hero, "commit", "-q", "-m", "hero note");
	await pack({}, f.ctx);
	assert.match(git(f.hero, "log", "-1", "--format=%s", "spec"), /^pack\(ideas\.[0-9a-f]{6}\): diver@example\.com put it down$/);
	assert.equal(git(f.hero, "log", "--format=%s", "spec").includes("hero note"), false, "the hero's own work is kept on the dive's ref, not on the base");
	assert.equal(git(f.hero, "rev-parse", "HEAD"), git(f.hero, "rev-parse", "spec"), "left detached at the branch");

	await assert.rejects(jumpFrom({ ref: id, from: "other" }, f.ctx), /is worked from spec, not other/);
	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), "hero note", "the hero's work is replayed on top of the bookkeeping");
	assert.match(git(f.hero, "log", "-1", "--format=%s", "spec"), /^jump\(/, "the base holds the bookkeeping, not the work");
	await land({}, f.ctx);
	assert.match(git(f.hero, "log", "-1", "--format=%s", "spec"), /^land\(ideas\.[0-9a-f]{6}\): diver@example\.com landed it$/);
	assert.ok(git(f.hero, "log", "--format=%s", "spec").includes("hero note"), "landing, the hero's work rides onto the branch");
	assert.match(f.doc(id), /\n {2}outcome: landed\n/);
	assert.equal(originMain(f), trunk, "trunk on origin never moved");
});

test("bails onto the branch too", async () => {
	const f = fixture("jump-from-bail");
	const trunk = onSpec(f);
	await jumpFrom({ ref: f.featId, from: "spec" }, f.ctx);
	await bail({ reason: "not this way" }, f.ctx);
	assert.match(git(f.hero, "log", "-1", "--format=%s", "spec"), /^bail\(ideas\.[0-9a-f]{6}\): not this way$/);
	assert.equal(originMain(f), trunk);
});

test("refuses a branch the hero lacks, one behind its namesake on origin, a hero holding commits it lacks, and --from for a dive of trunk", async () => {
	const f = fixture("jump-from-refusals");
	await assert.rejects(jumpFrom({ ref: f.featId, from: "nope" }, f.ctx), /--from nope names no local branch of the hero/);
	onSpec(f);
	git(f.hero, "push", "-q", "origin", "spec");
	git(f.hero, "commit", "-q", "--allow-empty", "-m", "on spec, pushed later");
	git(f.hero, "push", "-q", "origin", "spec");
	git(f.hero, "reset", "-q", "--hard", "HEAD^");
	await assert.rejects(jumpFrom({ ref: f.featId, from: "spec" }, f.ctx), /spec lacks 1 commit origin\/spec has: bring it up to date first/);
	git(f.hero, "merge", "-q", "--ff-only", "origin/spec");
	git(f.hero, "switch", "-q", "-c", "ahead");
	git(f.hero, "commit", "-q", "--allow-empty", "-m", "past spec");
	await assert.rejects(jumpFrom({ ref: f.featId, from: "spec" }, f.ctx), /the hero holds 1 commit spec lacks/);

	const g = fixture("jump-from-trunk-dive");
	await jump({ ref: g.featId }, g.ctx);
	const id = g.onDeck();
	await pack({}, g.ctx);
	await assert.rejects(jumpFrom({ ref: id, from: "main" }, g.ctx), /is worked against trunk, so it takes no --from/);
});
