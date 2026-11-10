// pack [<dive>]
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { i0735c57383365d4ca5395ea24f5b0649 as pack } from "./i0735c57383365d4ca5395ea24f5b0649.ts";
import { fixture, git } from "../test/harness.ts";

function rejectDelete(remote: string, ref: string): string {
	const hook = join(remote, "hooks", "pre-receive");
	writeFileSync(hook, `#!/bin/sh
while read old new ref; do
  if [ "$new" = "${"0".repeat(40)}" ] && [ "$ref" = "${ref}" ]; then
    echo "injected deletion failure" >&2
    exit 1
  fi
done
exit 0
`);
	return hook;
}

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
	const ref = `refs/nosedive/${f.heroId}/dives/${id}`;
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
	assert.match(doc, new RegExp(`\\n## \\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z packed\\n\\ndiver@example\\.com put it down\\.\\n\\n- data: 2 commits kept on ${ref} at \\w+\\n- hero: no work\\n$`));
	assert.equal(git(f.hero, "rev-parse", "HEAD"), git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0], "the record is on trunk");

	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), committed);
	assert.equal(readFileSync(join(f.checkout, "draft.md"), "utf8"), "half a thought\n");
	assert.equal(git(f.checkout, "status", "--porcelain"), "M README.md\n?? draft.md", "uncommitted again");
	assert.equal(readFileSync(join(f.checkout, "secrets.local"), "utf8"), "KEY=secret\n", "the feat's ignored files are back");
	assert.doesNotMatch(f.doc(id), /packer:/);
});

test("never packs or clears a workspace the checkout's own config names, nor the checkouts in it", async () => {
	const f = fixture("pack-workspace");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	mkdirSync(join(f.checkout, ".nosedive"));
	f.commit(".nosedive/config.yaml", "workspace: ./workspace\n");
	mkdirSync(join(f.checkout, "workspace", "nested"), { recursive: true });
	writeFileSync(join(f.checkout, "workspace", ".gitignore"), "*\n");
	writeFileSync(join(f.checkout, "workspace", "notes.md"), "kept\n");
	git(join(f.checkout, "workspace", "nested"), "init", "-q");
	writeFileSync(join(f.checkout, "workspace", "nested", "work.md"), "a nested checkout's work\n");

	await pack({}, f.ctx);
	assert.equal(readFileSync(join(f.checkout, "workspace", "notes.md"), "utf8"), "kept\n", "kept in place, not packed");
	assert.equal(readFileSync(join(f.checkout, "workspace", "nested", "work.md"), "utf8"), "a nested checkout's work\n");
	assert.equal(existsSync(join(f.hero, ".nosedive", "local", "packs", f.featId, "data.zip")), false, "nothing was packed");

	await jump({ ref: id }, f.ctx);
	assert.equal(readFileSync(join(f.checkout, "workspace", "notes.md"), "utf8"), "kept\n", "and jump leaves it alone");
	assert.equal(existsSync(join(f.checkout, "workspace", "nested", ".git")), true);
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
	assert.equal(f.remoteRef(`refs/nosedive/${f.heroId}/dives/${id}`), "", "nothing pushed");
	assert.equal(f.onDeck(), id, "still held");
});

test("refuses a ref pushed since jump even once a fetch into the shared cache has brought it here", async () => {
	const f = fixture("pack-lease-fetched");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	f.commit("idea.md", "an idea\n");
	const other = join(f.hero, "..", "other");
	git(f.hero, "clone", "-q", f.remote, other);
	git(other, "-c", "user.name=O", "-c", "user.email=o@example.com", "commit", "-q", "--allow-empty", "-m", "theirs");
	const theirs = `refs/nosedive/dives/elsewhere/main/${id}`;
	git(other, "push", "-q", "origin", `HEAD:${theirs}`);
	// As core's hydrate does to the cache whenever any checkout of the repo is hydrated or docked.
	git(f.checkout, "fetch", "-q", "--prune", "origin", "+refs/nosedive/*:refs/nosedive/*");
	await assert.rejects(pack({}, f.ctx), new RegExp(`data: ${theirs.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} is at \\w{7}, which this dive did not see`));
	assert.notEqual(f.remoteRef(theirs), "", "their ref is kept");
	assert.equal(f.onDeck(), id, "still held");
});

test("a dive packed from one checkout of the hero is jumped from another with its work, and keeps one ref", async () => {
	const f = fixture("pack-shared");
	// A clone, not a worktree: it shares no refs, so jump finds the dive through what it fetches.
	const other = join(f.hero, "..", "other-clone");
	git(f.hero, "clone", "-q", git(f.hero, "remote", "get-url", "origin"), other);
	git(other, "config", "user.name", "Work Test");
	git(other, "config", "user.email", "diver@example.com");
	await jump({ ref: f.featId }, { ...f.ctx, cwd: other });
	const theirs = join(other, "workspace", "data");
	writeFileSync(join(theirs, "idea.md"), "theirs\n");
	git(theirs, "add", "-A");
	git(theirs, "commit", "-q", "-m", "add idea.md");
	const committed = git(theirs, "rev-parse", "HEAD");
	await pack({}, { ...f.ctx, cwd: other });
	const ref = git(f.remote, "for-each-ref", "--format=%(refname)", "refs/nosedive");
	assert.match(ref, new RegExp(`^refs/nosedive/${f.heroId}/dives/[0-9a-f-]{36}$`), "no branch in its name");

	await jump({ ref: ref.split("/").pop() }, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), committed, "the other checkout's work is here");
	const mine = f.commit("more.md", "mine\n");
	await pack({}, f.ctx);
	assert.equal(git(f.remote, "for-each-ref", "--format=%(refname) %(objectname)", "refs/nosedive"), `${ref} ${mine}`, "one ref, whichever checkout packed it");
});

test("a dive's ref under the name before hero-dive-refs is jumped, and its next pack replaces it", async () => {
	const f = fixture("pack-old-ref");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const committed = f.commit("idea.md", "an idea\n");
	await pack({}, f.ctx);
	const ref = `refs/nosedive/${f.heroId}/dives/${id}`;
	const old = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(f.remote, "update-ref", old, committed);
	git(f.remote, "update-ref", "-d", ref);

	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), committed);
	const mine = f.commit("more.md", "more\n");
	await pack({}, f.ctx);
	assert.equal(git(f.remote, "for-each-ref", "--format=%(refname) %(objectname)", "refs/nosedive"), `${ref} ${mine}`);
});

test("refuses work in a read-only scope", async () => {
	const f = fixture("pack-readonly", { readOnly: true });
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	await assert.rejects(pack({}, f.ctx), /read-only scopes hold work with nowhere to go, so nothing was packed:\n {2}data is read-only, yet has commits origin lacks/);
	assert.equal(f.onDeck().length, 36, "still held");
});

test("publishes without atomic-push support at the origin", async () => {
	const f = fixture("pack-no-atomic");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const committed = f.commit("idea.md", "an idea\n");
	git(f.remote, "config", "receive.advertiseAtomic", "false");

	await pack({}, f.ctx);

	assert.equal(f.remoteRef(`refs/nosedive/${f.heroId}/dives/${id}`), committed);
	assert.throws(() => f.onDeck());
});

test("a stale per-ref lease stops cleanup after publication and keeps local work", async () => {
	const f = fixture("pack-stale-lease");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const oldTip = f.commit("idea.md", "an idea\n");
	await pack({}, f.ctx);
	const own = `refs/nosedive/${f.heroId}/dives/${id}`;
	const legacy = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(f.remote, "update-ref", legacy, oldTip);
	await jump({ ref: id }, f.ctx);
	const target = f.commit("more.md", "more work\n");
	const hook = join(f.remote, "hooks", "post-receive");
	writeFileSync(hook, `#!/bin/sh
while read old new ref; do
  if [ "$ref" = "${own}" ]; then
    git update-ref "${legacy}" "$new"
  fi
done
`);

	await assert.rejects(pack({}, f.ctx), (error: unknown) => {
		assert.match(String(error), new RegExp(legacy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
		assert.match(String(error), /stale info|expected|cannot lock ref/i);
		return true;
	});

	assert.equal(f.remoteRef(own), target, "the destination was published first");
	assert.equal(f.remoteRef(legacy), target, "the concurrent update was not deleted");
	assert.equal(f.onDeck(), id, "the dive branch remains active");
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), target, "scope work remains on its local branch");
	unlinkSync(hook);
	await assert.rejects(pack({}, f.ctx), new RegExp(legacy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	assert.equal(f.onDeck(), id);
});

test("retries after partial cleanup across a scope and the hero", async () => {
	const f = fixture("pack-partial-retry");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const first = f.commit("first.md", "first work\n");
	await pack({}, f.ctx);
	const dataOwn = `refs/nosedive/${f.heroId}/dives/${id}`;
	const dataA = `refs/nosedive/dives/${f.heroId}/a/${id}`;
	const dataZ = `refs/nosedive/dives/${f.heroId}/z/${id}`;
	const heroLegacy = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(f.remote, "update-ref", dataA, first);
	git(f.remote, "update-ref", dataZ, first);
	const heroRemote = git(f.hero, "remote", "get-url", "origin");
	const heroOriginal = git(f.hero, "rev-parse", "HEAD");
	git(heroRemote, "update-ref", heroLegacy, heroOriginal);

	await jump({ ref: id }, f.ctx);
	const dataTarget = f.commit("second.md", "second work\n");
	writeFileSync(join(f.hero, "hero-work.md"), "hero work\n");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-q", "-m", "hero work");
	const heroTarget = git(f.hero, "rev-parse", "HEAD");
	const hook = rejectDelete(heroRemote, heroLegacy);

	await assert.rejects(pack({}, f.ctx), new RegExp(heroLegacy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

	assert.equal(f.remoteRef(dataOwn), dataTarget);
	assert.equal(f.remoteRef(dataA), "", "scope cleanup completed before the hero failure");
	assert.equal(f.remoteRef(dataZ), "");
	assert.equal(git(heroRemote, "rev-parse", heroLegacy), heroOriginal, "the failed deletion remains");
	assert.equal(git(heroRemote, "rev-parse", `refs/nosedive/${f.heroId}/dives/${id}`), heroTarget);
	assert.equal(git(f.hero, "rev-parse", "HEAD"), heroTarget, "hero work remains recoverable");
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), dataTarget, "scope work remains recoverable");
	assert.equal(f.onDeck(), id);

	unlinkSync(hook);
	// Work added between the failed pack and its retry: the dive's own ref holds the earlier publish, which HEAD contains.
	const dataRetried = f.commit("third.md", "third work\n");
	await pack({}, f.ctx);
	assert.equal(git(f.remote, "for-each-ref", "--format=%(refname) %(objectname)", "refs/nosedive"), `${dataOwn} ${dataRetried}`);
	assert.equal(git(heroRemote, "for-each-ref", "--format=%(refname) %(objectname)", "refs/nosedive"), `${dataOwn} ${heroTarget}`);
});

test("deletes all refs under lease when there is no work, including legacy names", async () => {
	const f = fixture("pack-no-work");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const committed = f.commit("idea.md", "an idea\n");
	await pack({}, f.ctx);
	const legacy = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(f.checkout, "push", "-q", "origin", `${committed}:refs/heads/work/ideas`);
	git(f.remote, "update-ref", legacy, committed);

	await jump({ ref: id }, f.ctx);
	await pack({}, f.ctx);

	assert.equal(git(f.remote, "for-each-ref", "--format=%(refname)", "refs/nosedive"), "");
	assert.ok(f.out.some((line) => line.includes("- data: no work")));
});
