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

/** A local branch `spec` one commit past trunk, as a spec pull request's is, and the hero on a branch of its own at it; returns trunk on origin. */
function onSpec(f: ReturnType<typeof fixture>): string {
	const trunk = git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0]!;
	git(f.hero, "switch", "-q", "-c", "spec");
	writeFileSync(join(f.hero, "SPEC.md"), "the spec\n");
	git(f.hero, "add", "SPEC.md");
	git(f.hero, "commit", "-q", "-m", "spec");
	git(f.hero, "switch", "-q", "-c", "proto");
	return trunk;
}

const originMain = (f: ReturnType<typeof fixture>) => git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0];

test("jumps a feat against a local branch: the dive records it, its bookkeeping moves that branch, the hero stays on its own branch, and trunk on origin is untouched", async () => {
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
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "proto", "the hero stays on its own branch");
});

test("packs, jumps again from the recorded branch and lands onto it, the hero's work riding it, and never pushes trunk", async () => {
	const f = fixture("jump-from-loop");
	const trunk = onSpec(f);
	const own = git(f.hero, "rev-parse", "spec");
	await jumpFrom({ ref: f.featId, from: "spec" }, f.ctx);
	const id = f.onDeck();
	writeFileSync(join(f.hero, "NOTE.md"), "hero work\n");
	git(f.hero, "add", "NOTE.md");
	git(f.hero, "commit", "-q", "-m", "hero note");
	await pack({}, f.ctx);
	assert.match(git(f.hero, "log", "-1", "--format=%s", "spec"), /^pack\(ideas\.[0-9a-f]{6}\): diver@example\.com put it down$/);
	assert.equal(git(f.hero, "log", "--format=%s", "spec").includes("hero note"), false, "the hero's own work is kept on the dive's ref, not on the base");
	assert.equal(git(f.hero, "rev-parse", "HEAD"), git(f.hero, "rev-parse", "spec"), "the hero's branch reset to the base");

	git(f.hero, "branch", "other", "spec");
	await assert.rejects(jumpFrom({ ref: id, from: "other" }, f.ctx), /is worked from spec, not other/);
	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), "hero note", "the hero's work is replayed on top of the bookkeeping");
	assert.match(git(f.hero, "log", "-1", "--format=%s", "spec"), /^jump\(/, "the base holds the bookkeeping, not the work");
	const before = git(f.hero, "rev-parse", "spec");
	await land({}, f.ctx);
	assert.equal(git(f.hero, "merge-base", "--is-ancestor", before, "spec"), "", "the base's history is kept: land only adds to it");
	assert.equal(git(f.hero, "merge-base", "--is-ancestor", own, "spec"), "", "the branch's own commit among it");
	assert.equal(git(f.hero, "log", "-1", "--format=%(trailers:only,unfold)", own), "", "unstamped by the dive");
	assert.match(git(f.hero, "log", "-1", "--format=%(trailers:only,unfold)", "spec^"), /Nosedive-Dive: /, "the hero's work does");
	assert.match(git(f.hero, "log", "-1", "--format=%s", "spec"), /^land\(ideas\.[0-9a-f]{6}\): diver@example\.com landed it$/);
	assert.ok(git(f.hero, "log", "--format=%s", "spec").includes("hero note"), "landing, the hero's work rides onto the branch");
	assert.match(f.doc(id), /\n {2}outcome: landed\n/);
	assert.equal(originMain(f), trunk, "trunk on origin never moved");
});

test("bails onto the branch too", async () => {
	const f = fixture("jump-from-bail");
	const trunk = onSpec(f);
	await jumpFrom({ ref: f.featId, from: "spec" }, f.ctx);
	await bail({ why: "not this way" }, f.ctx);
	assert.match(git(f.hero, "log", "-1", "--format=%s", "spec"), /^bail\(ideas\.[0-9a-f]{6}\): not this way$/);
	assert.equal(originMain(f), trunk);
});

test("refuses a branch the hero lacks, one behind its namesake on origin, a hero holding commits it lacks, and --from for a dive of trunk", async () => {
	const f = fixture("jump-from-refusals");
	await assert.rejects(jumpFrom({ ref: f.featId, from: "nope" }, f.ctx), /--from nope names no local branch of the hero/);
	onSpec(f);
	git(f.hero, "switch", "-q", "spec");
	await assert.rejects(jumpFrom({ ref: f.featId, from: "spec" }, f.ctx), /the hero is on spec, the branch the dive is worked from: switch to a branch of its own first/);
	git(f.hero, "push", "-q", "origin", "spec");
	git(f.hero, "commit", "-q", "--allow-empty", "-m", "on spec, pushed later");
	git(f.hero, "push", "-q", "origin", "spec");
	git(f.hero, "reset", "-q", "--hard", "HEAD^");
	git(f.hero, "switch", "-q", "proto");
	await assert.rejects(jumpFrom({ ref: f.featId, from: "spec" }, f.ctx), /spec lacks 1 commit origin\/spec has: bring it up to date first/);
	git(f.hero, "branch", "-f", "spec", "origin/spec");
	git(f.hero, "reset", "-q", "--hard", "spec");
	git(f.hero, "commit", "-q", "--allow-empty", "-m", "past spec");
	await assert.rejects(jumpFrom({ ref: f.featId, from: "spec" }, f.ctx), /the hero holds 1 commit spec lacks/);

	const g = fixture("jump-from-trunk-dive");
	await jump({ ref: g.featId }, g.ctx);
	const id = g.onDeck();
	await pack({}, g.ctx);
	git(g.hero, "branch", "elsewhere");
	await assert.rejects(jumpFrom({ ref: id, from: "elsewhere" }, g.ctx), /is worked against trunk, so it takes no --from/);
});

test("refuses to work a recorded branch the hero is on, or one deleted since, losing nothing", async () => {
	const f = fixture("jump-from-guards");
	onSpec(f);
	await jumpFrom({ ref: f.featId, from: "spec" }, f.ctx);
	const id = f.onDeck();
	writeFileSync(join(f.hero, "NOTE.md"), "hero work\n");
	git(f.hero, "add", "NOTE.md");
	git(f.hero, "commit", "-q", "-m", "hero note");
	await pack({}, f.ctx);
	git(f.hero, "switch", "-q", "spec");
	await assert.rejects(jump({ ref: id }, f.ctx), /the hero is on spec, the branch the dive is worked from: switch to a branch of its own first/, "jumping its dive again from the base itself is refused too");
	git(f.hero, "switch", "-q", "proto");
	await jump({ ref: id }, f.ctx);
	const spec = git(f.hero, "rev-parse", "spec");
	git(f.hero, "branch", "-D", "spec");
	const refs = git(f.hero, "ls-remote", "origin", "refs/nosedive/*");
	await assert.rejects(pack({}, f.ctx), /the dive is worked from spec, which the hero no longer has: recreate it/);
	assert.equal(git(f.hero, "ls-remote", "origin", "refs/nosedive/*"), refs, "the dive's refs on origin are untouched");
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), "hero note", "and so is the hero's work");
	git(f.hero, "branch", "spec", spec);
	await pack({}, f.ctx);
	assert.match(git(f.hero, "log", "-1", "--format=%s", "spec"), /^pack\(/);
});
