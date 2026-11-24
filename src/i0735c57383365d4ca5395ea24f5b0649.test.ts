// pack [<dive>]
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { i0735c57383365d4ca5395ea24f5b0649 as pack } from "./i0735c57383365d4ca5395ea24f5b0649.ts";
import { i2bcf8d7ee2645df5b261ee1b2135d190 as land } from "./i2bcf8d7ee2645df5b261ee1b2135d190.ts";
import { iffc777778a63553ba90babcc038eb748 as bail } from "./iffc777778a63553ba90babcc038eb748.ts";
import { fetchAll } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { unzipSync } from "fflate";
import { fixture, git, onOrigin, tempDir, turner } from "../test/harness.ts";

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
`, { mode: 0o755 });
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

test("an ignored file rewritten during publication is captured, never cleaned from an older path list", async () => {
	const f = fixture("pack-ignored-race");
	await jump({ ref: f.featId }, f.ctx);
	writeFileSync(join(f.checkout, ".gitignore"), "secrets.local\n");
	f.commit("idea.md", "an idea\n");
	writeFileSync(join(f.checkout, "secrets.local"), "before\n");
	const hook = join(git(f.checkout, "rev-parse", "--path-format=absolute", "--git-common-dir"), "hooks", "pre-push");
	writeFileSync(hook, `#!/bin/sh\nprintf 'during publish\\n' > "${join(f.checkout, "secrets.local").replace(/\\/g, "/")}"\nexit 0\n`, { mode: 0o755 });

	await pack({}, f.ctx);

	const zip = unzipSync(new Uint8Array(readFileSync(join(f.hero, ".nosedive", "local", "packs", f.featId, "data.zip"))));
	assert.equal(new TextDecoder().decode(zip["secrets.local"]), "during publish\n");
});

test("fetchAll refuses a scope fetch failure", () => {
	const f = fixture("fetch-all-failure");
	renameSync(f.remote, `${f.remote}-offline`);
	assert.throws(() => fetchAll(f.checkout), /cannot fetch origin/);
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

test("never packs or clears files reached through an ignored junction, which git lists as the checkout's own on Windows", async () => {
	const f = fixture("pack-junction");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	writeFileSync(join(f.checkout, ".gitignore"), "secrets.local\nlinked/\n");
	f.commit("idea.md", "an idea\n");
	writeFileSync(join(f.checkout, "secrets.local"), "KEY=secret\n");
	const target = tempDir("junction-target");
	writeFileSync(join(target, "outside.txt"), "not the checkout's\n");
	// A junction with an absolute target; elsewhere the type is ignored and this is a plain symlink.
	symlinkSync(target, join(f.checkout, "linked"), "junction");

	await pack({}, f.ctx);
	const zip = unzipSync(new Uint8Array(readFileSync(join(f.hero, ".nosedive", "local", "packs", f.featId, "data.zip"))));
	assert.deepEqual(Object.keys(zip), ["secrets.local"], "only the checkout's own ignored file is packed");
	assert.equal(readFileSync(join(target, "outside.txt"), "utf8"), "not the checkout's\n", "the target survives the pack");

	await jump({ ref: id }, f.ctx);
	assert.equal(readFileSync(join(target, "outside.txt"), "utf8"), "not the checkout's\n", "and the jump's swap");
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
	// Another checkout moves the legacy ref to a commit of its own while the push is on its way.
	const remote = f.remote.replace(/\\/g, "/");
	const hook = join(git(f.checkout, "rev-parse", "--path-format=absolute", "--git-common-dir"), "hooks", "pre-push");
	writeFileSync(hook, `#!/bin/sh\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\nG="git --git-dir=${remote}"\n$G update-ref "${legacy}" $(echo moved | $G -c user.name=Other -c user.email=other@example.com commit-tree $($G rev-parse refs/heads/main^{tree}))\nexit 0\n`, { mode: 0o755 });

	await assert.rejects(pack({}, f.ctx), (error: unknown) => {
		assert.match(String(error), new RegExp(legacy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
		return true;
	});
	assert.equal(f.remoteRef(own), target, "work published first is a safe prefix when a later deletion is stale");
	assert.notEqual(f.remoteRef(legacy), "", "the concurrent update was not deleted");
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
	assert.equal(git(heroRemote, "rev-parse", `refs/nosedive/${f.heroId}/dives/${id}`), heroTarget, "hero work published before the failed deletion, while the record stayed last");
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

// Fix round 2: recovery from the partial prefixes a per-ref publish may leave, at the command level.

/** A commit in a bare repo that no branch has, as another checkout's newer work on a dive ref would be. */
function strayCommit(remote: string): string {
	const env = { ...process.env, GIT_AUTHOR_NAME: "Other", GIT_AUTHOR_EMAIL: "other@example.com", GIT_COMMITTER_NAME: "Other", GIT_COMMITTER_EMAIL: "other@example.com" };
	const tree = spawnSync("git", ["--git-dir", remote, "rev-parse", "refs/heads/main^{tree}"], { encoding: "utf8" }).stdout.trim();
	const parent = spawnSync("git", ["--git-dir", remote, "rev-parse", "refs/heads/main"], { encoding: "utf8" }).stdout.trim();
	return spawnSync("git", ["--git-dir", remote, "commit-tree", tree, "-p", parent, "-m", "newer work"], { encoding: "utf8", env }).stdout.trim();
}

test("land finishes after a later deletion failed, once the scope's stamped tip is already published", async () => {
	const f = fixture("land-resume");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const tip = f.commit("idea.md", "an idea\n");
	const legacy = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(f.checkout, "push", "-q", "origin", `${tip}:${legacy}`);
	const hook = rejectDelete(f.remote, legacy);
	await assert.rejects(land({}, f.ctx), /injected deletion failure/);
	const published = f.remoteRef("refs/heads/work/ideas");
	assert.notEqual(published, "", "the stamped work was published first");
	assert.equal(f.onDeck(), id, "the dive is still on deck");
	unlinkSync(hook);
	await land({}, f.ctx);
	assert.equal(f.remoteRef("refs/heads/work/ideas"), published, "nothing was published twice or over");
	assert.equal(f.remoteRef(legacy), "", "the dive's ref is gone");
	assert.throws(() => f.onDeck(), "the dive is over");
});

test("pack resumes after its dirty snapshot was published and a later deletion failed, recognising its own sha", async () => {
	const f = fixture("pack-resume-dirty");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const oldTip = f.commit("idea.md", "an idea\n");
	await pack({}, f.ctx);
	const legacy = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(f.remote, "update-ref", legacy, oldTip);
	await jump({ ref: id }, f.ctx);
	writeFileSync(join(f.checkout, "draft.md"), "unsaved work\n");
	const hook = rejectDelete(f.remote, legacy);
	await assert.rejects(pack({}, f.ctx), /injected deletion failure/);
	const own = `refs/nosedive/${f.heroId}/dives/${id}`;
	const wip = f.remoteRef(own);
	assert.notEqual(wip, oldTip, "the snapshot was published");
	unlinkSync(hook);
	await pack({}, f.ctx);
	assert.equal(f.remoteRef(own), wip, "the retry recognised the snapshot as its own and published nothing new");
	assert.equal(f.remoteRef(legacy), "");
	assert.equal(git(f.remote, "show", `${wip}:draft.md`), "unsaved work");
});

test("bail resumes after its dirty snapshot was published and a later deletion failed", async () => {
	const f = fixture("bail-resume-dirty");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const oldTip = f.commit("idea.md", "an idea\n");
	await pack({}, f.ctx);
	const legacy = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(f.remote, "update-ref", legacy, oldTip);
	await jump({ ref: id }, f.ctx);
	writeFileSync(join(f.checkout, "draft.md"), "unsaved work\n");
	const hook = rejectDelete(f.remote, legacy);
	await assert.rejects(bail({ reason: "superseded" }, f.ctx), /injected deletion failure/);
	const own = `refs/nosedive/${f.heroId}/dives/${id}`;
	const wip = f.remoteRef(own);
	assert.notEqual(wip, oldTip, "the dirty snapshot was published before the refused deletion");
	unlinkSync(hook);
	await bail({ reason: "superseded" }, f.ctx);
	assert.equal(f.remoteRef(own), wip, "the retry recognised its published snapshot");
	assert.equal(f.remoteRef(legacy), "");
	assert.match(f.doc(id), /outcome: bailed/);
});

test("pack resumes a no-work all-deletions plan after an earlier deletion succeeded", async () => {
	const f = fixture("pack-resume-deletions");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const committed = f.commit("idea.md", "an idea\n");
	await pack({}, f.ctx);
	git(f.checkout, "push", "-q", "origin", `${committed}:refs/heads/work/ideas`);
	const legacy = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(f.remote, "update-ref", legacy, committed);
	await jump({ ref: id }, f.ctx);
	const hook = rejectDelete(f.remote, legacy);
	await assert.rejects(pack({}, f.ctx), /injected deletion failure/);
	assert.equal(f.remoteRef(`refs/nosedive/${f.heroId}/dives/${id}`), "", "the own ref deletion was a safe completed prefix");
	assert.equal(f.remoteRef(legacy), committed, "the refused deletion remains");
	unlinkSync(hook);
	await pack({}, f.ctx);
	assert.equal(git(f.remote, "for-each-ref", "--format=%(refname)", "refs/nosedive"), "");
});

test("pack refuses an own ref it did not publish, even when it is an ancestor of HEAD", async () => {
	const f = fixture("pack-own-ancestor");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const first = f.commit("first.md", "first\n");
	f.commit("second.md", "second\n");
	const own = `refs/nosedive/${f.heroId}/dives/${id}`;
	git(f.checkout, "push", "-q", "origin", `${first}:${own}`);
	await assert.rejects(pack({}, f.ctx), /which this dive did not see/);
	assert.equal(f.remoteRef(own), first, "left as it was");
	assert.equal(f.onDeck(), id);
});

test("land refuses to delete a dive ref holding newer work than the landed work or the recorded tip", async () => {
	const f = fixture("land-newer-ref");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	f.commit("idea.md", "an idea\n");
	const newer = strayCommit(f.remote);
	const legacy = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(f.remote, "update-ref", legacy, newer);
	const heads = git(f.checkout, "ls-remote", "origin", "refs/heads/work/ideas");
	await assert.rejects(land({}, f.ctx), /work this dive did not see and the landed work does not hold/);
	assert.equal(git(f.checkout, "ls-remote", "origin", "refs/heads/work/ideas"), heads, "nothing was pushed");
	assert.equal(f.remoteRef(legacy), newer, "the newer work was not deleted");
});

test("land refuses to delete an unproven hero dive tip", async () => {
	const f = fixture("land-newer-hero-ref");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	f.commit("idea.md", "an idea\n");
	const heroRemote = git(f.hero, "remote", "get-url", "origin");
	const newer = strayCommit(heroRemote);
	const legacy = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(heroRemote, "update-ref", legacy, newer);
	const heads = git(f.checkout, "ls-remote", "origin", "refs/heads/work/ideas");
	await assert.rejects(land({}, f.ctx), /work this dive did not see and the landed work does not hold/);
	assert.equal(git(f.checkout, "ls-remote", "origin", "refs/heads/work/ideas"), heads, "nothing was pushed");
	assert.equal(git(heroRemote, "rev-parse", legacy), newer, "the unproven hero work was not deleted");
});

test("a retry refuses a dive another invocation has landed meanwhile", async () => {
	const f = fixture("pack-landed-meanwhile");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const parent = tempDir("pack-other");
	git(parent, "clone", "-q", git(f.hero, "remote", "get-url", "origin"), "clone");
	const clone = join(parent, "clone");
	const doc = join(clone, "kb", `${id}.md`);
	writeFileSync(doc, readFileSync(doc, "utf8").replace("\nmeta:\n", "\nmeta:\n  outcome: landed\n"));
	git(clone, "add", "-A");
	git(clone, "-c", "user.name=Other", "-c", "user.email=other@example.com", "commit", "-q", "-m", "landed elsewhere");
	git(clone, "push", "-q", "origin", "HEAD:main");
	await assert.rejects(pack({}, f.ctx), /is over: it landed/);
	assert.equal(f.onDeck(), id, "nothing was put down");
});

test("an ignored path that became a directory during publication is left in place with its new work, and rebuildable ones are never deleted", async () => {
	const f = fixture("pack-ignored-dir");
	await jump({ ref: f.featId }, f.ctx);
	writeFileSync(join(f.checkout, ".gitignore"), "secrets.local\nnode_modules/\n");
	f.commit("idea.md", "an idea\n");
	writeFileSync(join(f.checkout, "secrets.local"), "before\n");
	mkdirSync(join(f.checkout, "node_modules"));
	writeFileSync(join(f.checkout, "node_modules", "dep.js"), "dep\n");
	const hook = join(git(f.checkout, "rev-parse", "--path-format=absolute", "--git-common-dir"), "hooks", "pre-push");
	const target = join(f.checkout, "secrets.local").replace(/\\/g, "/");
	writeFileSync(hook, `#!/bin/sh\nrm -f "${target}"\nmkdir "${target}"\nprintf 'new work\\n' > "${target}/new.txt"\nprintf 'changed meanwhile\\n' > "${join(f.checkout, "node_modules", "dep.js").replace(/\\/g, "/")}"\nexit 0\n`, { mode: 0o755 });
	await assert.rejects(pack({}, f.ctx), /left in place, out of the pack: secrets\.local/);
	assert.equal(readFileSync(join(f.checkout, "secrets.local", "new.txt"), "utf8"), "new work\n", "the new work is intact");
	assert.equal(readFileSync(join(f.checkout, "node_modules", "dep.js"), "utf8"), "changed meanwhile\n", "a rebuildable file that is no longer the one seen is never deleted");
});

test("land finishes the cleanup of a landed record it published, when a hero ref deletion failed", async () => {
	const f = fixture("land-hero-cleanup");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	f.commit("idea.md", "an idea\n");
	const heroRemote = git(f.hero, "remote", "get-url", "origin");
	const legacy = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(f.hero, "push", "-q", "origin", `HEAD:${legacy}`);
	const hook = rejectDelete(heroRemote, legacy);
	await assert.rejects(land({}, f.ctx), /injected deletion failure/);
	assert.match(git(heroRemote, "log", "-1", "--format=%s", "refs/heads/main"), /^land\(/, "the landed record was published");
	assert.equal(f.onDeck(), id, "the dive is still on deck here");
	unlinkSync(hook);
	await land({}, f.ctx);
	assert.equal(git(heroRemote, "for-each-ref", legacy), "", "the remaining cleanup finished");
	assert.throws(() => f.onDeck(), "the dive is over here too");
	assert.equal(git(heroRemote, "rev-list", "--count", "refs/heads/main", "--grep=^land("), "1", "no second record");
});

test("a retry refuses a dive someone else landed, whatever marker this checkout holds", async () => {
	const f = fixture("land-someone-else");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const parent = tempDir("land-other");
	git(parent, "clone", "-q", git(f.hero, "remote", "get-url", "origin"), "clone");
	const clone = join(parent, "clone");
	const doc = join(clone, "kb", `${id}.md`);
	writeFileSync(doc, readFileSync(doc, "utf8").replace("\nmeta:\n", "\nmeta:\n  outcome: landed\n"));
	git(clone, "add", "-A");
	git(clone, "-c", "user.name=Other", "-c", "user.email=other@example.com", "commit", "-q", "-m", "landed elsewhere");
	git(clone, "push", "-q", "origin", "HEAD:main");
	await assert.rejects(land({}, f.ctx), /is over: it landed/);
});

test("land finishes its cleanup when someone pushed a commit on top of its landed record, without rewinding the home", async () => {
	const f = fixture("land-record-buried");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	f.commit("idea.md", "an idea\n");
	const heroRemote = git(f.hero, "remote", "get-url", "origin");
	const legacy = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(f.hero, "push", "-q", "origin", `HEAD:${legacy}`);
	const hook = rejectDelete(heroRemote, legacy);
	await assert.rejects(land({}, f.ctx), /injected deletion failure/);
	const parent = tempDir("land-buried");
	git(parent, "clone", "-q", heroRemote, "clone");
	const clone = join(parent, "clone");
	writeFileSync(join(clone, "later.md"), "later\n");
	git(clone, "add", "-A");
	git(clone, "-c", "user.name=Other", "-c", "user.email=other@example.com", "commit", "-q", "-m", "later work");
	git(clone, "push", "-q", "origin", "HEAD:main");
	const tip = git(heroRemote, "rev-parse", "refs/heads/main");
	unlinkSync(hook);
	await land({}, f.ctx);
	assert.equal(git(heroRemote, "for-each-ref", legacy), "", "the cleanup finished");
	assert.throws(() => f.onDeck(), "the dive is over here");
	assert.equal(git(f.hero, "rev-parse", "main"), tip, "the home is at the latest published tip, not rewound to the record");
	assert.equal(git(heroRemote, "rev-parse", "refs/heads/main"), tip, "and nothing was pushed");
});

test("a land rerun lands the dive as it is now, fast-forwarding what the failed run published, and names the commits that run had not", async () => {
	const f = fixture("land-rerun-current");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	f.commit("idea.md", "an idea\n");
	const heroRemote = git(f.hero, "remote", "get-url", "origin");
	const legacy = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(f.hero, "push", "-q", "origin", `HEAD:${legacy}`);
	const hook = rejectDelete(heroRemote, legacy);
	await assert.rejects(land({}, f.ctx), /injected deletion failure/);
	const published = f.remoteRef("refs/heads/work/ideas");
	const late = f.commit("late.md", "made after the failure\n");
	writeFileSync(join(f.hero, "late-hero.md"), "hero work after the failure\n");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-q", "-m", "late hero work");
	unlinkSync(hook);
	f.out.length = 0;
	await land({}, f.ctx);
	assert.equal(git(f.remote, "rev-list", "--count", `${published}..refs/heads/work/ideas`), "1", "the rerun fast-forwarded from what the failed run published");
	assert.equal(git(f.remote, "merge-base", published, "refs/heads/work/ideas"), published);
	assert.equal(git(f.remote, "show", "refs/heads/work/ideas:late.md"), "made after the failure");
	assert.equal(git(heroRemote, "show", "refs/heads/main:late-hero.md"), "hero work after the failure");
	const said = f.out.join("\n");
	assert.match(said, /commits the failed land had not published/);
	assert.match(said, new RegExp(`${late.slice(0, 7)} add late\\.md`));
	assert.match(said, /[0-9a-f]{7} late hero work/);
	assert.equal(git(heroRemote, "for-each-ref", legacy), "", "the cleanup finished");
	assert.throws(() => f.onDeck(), "the dive is over");
});

test("a land rerun whose plan would rewrite what the failed run published refuses instead", async () => {
	const f = fixture("land-rerun-rewrite");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	f.commit("idea.md", "an idea\n");
	const heroRemote = git(f.hero, "remote", "get-url", "origin");
	const legacy = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	git(f.hero, "push", "-q", "origin", `HEAD:${legacy}`);
	const hook = rejectDelete(heroRemote, legacy);
	await assert.rejects(land({}, f.ctx), /injected deletion failure/);
	const published = f.remoteRef("refs/heads/work/ideas");
	git(f.checkout, "reset", "-q", "--hard", "HEAD~1");
	f.commit("other.md", "a different history\n");
	unlinkSync(hook);
	await assert.rejects(land({}, f.ctx), /has moved to/);
	assert.equal(f.remoteRef("refs/heads/work/ideas"), published, "nothing was rewritten");
});

test("a re-plan inside one land run never publishes a commit made while it ran", async () => {
	const f = fixture("land-pinned");
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	const parent = tempDir("land-pinned-other");
	git(parent, "clone", "-q", git(f.hero, "remote", "get-url", "origin"), "clone");
	const clone = join(parent, "clone").replace(/\\/g, "/");
	const guard = join(parent, "ran").replace(/\\/g, "/");
	const scope = f.checkout.replace(/\\/g, "/");
	const hook = join(git(f.hero, "rev-parse", "--path-format=absolute", "--git-common-dir"), "hooks", "pre-push");
	const person = `git -c user.name=O -c user.email=o@example.com`;
	// While the hero's push is on its way: a commit lands on the scope's dive branch, and the home moves, so the run plans again.
	writeFileSync(hook, `#!/bin/sh\ncase "$(cat)" in *" refs/heads/main "*) ;; *) exit 0;; esac\n[ -e "${guard}" ] && exit 0\n: > "${guard}"\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ncd "${scope}" && echo late > late.md && git add -A && ${person} commit -qm made-during-the-run\ncd "${clone}" && echo x > x.md && git add -A && ${person} commit -qm other && git push -q origin HEAD:main\nexit 0\n`, { mode: 0o755 });
	await assert.rejects(land({}, f.ctx), /gained commits while this run was publishing/);
	assert.doesNotMatch(git(f.remote, "ls-tree", "-r", "--name-only", "refs/heads/work/ideas"), /late\.md/, "the commit made during the run was not published");
});

test("a rerun names the commits the failed run had not published even when the hero record never reached the home", async () => {
	const f = fixture("land-rerun-names-no-record");
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	const heroRemote = git(f.hero, "remote", "get-url", "origin");
	const guard = join(tempDir("land-names-guard"), "open").replace(/\\/g, "/");
	const hook = join(heroRemote, "hooks", "pre-receive");
	// The hero's home refuses its push until the guard file exists, so the scope is published and the record is not.
	writeFileSync(hook, `#!/bin/sh\nwhile read old new ref; do\n  if [ "$ref" = "refs/heads/main" ] && [ ! -e "${guard}" ]; then\n    echo "injected home refusal" >&2\n    exit 1\n  fi\ndone\nexit 0\n`, { mode: 0o755 });
	await assert.rejects(land({}, f.ctx), /injected home refusal/);
	const late = f.commit("late.md", "made after the failure\n");
	writeFileSync(join(f.hero, "late-hero.md"), "hero work after the failure\n");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-q", "-m", "late hero work");
	writeFileSync(guard, "");
	f.out.length = 0;
	await land({}, f.ctx);
	const said = f.out.join("\n");
	assert.match(said, /commits the failed land had not published/);
	assert.match(said, new RegExp(`${late.slice(0, 7)} add late\\.md`));
	assert.match(said, /[0-9a-f]{7} late hero work/);
});

test("a commit made on a scope after the run took its tips is never planned or published by that run", async () => {
	const f = fixture("land-snapshot-tips");
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	const parent = tempDir("land-snapshot-other");
	git(parent, "clone", "-q", git(f.hero, "remote", "get-url", "origin"), "clone");
	const clone = join(parent, "clone");
	writeFileSync(join(clone, "x.md"), "x\n");
	git(clone, "add", "-A");
	git(clone, "-c", "user.name=O", "-c", "user.email=o@example.com", "commit", "-q", "-m", "other");
	git(clone, "push", "-q", "origin", "HEAD:main");
	const guard = join(parent, "ran").replace(/\\/g, "/");
	const scope = f.checkout.replace(/\\/g, "/");
	const hook = join(git(f.hero, "rev-parse", "--path-format=absolute", "--git-common-dir"), "hooks", "reference-transaction");
	// The run's own fetch of the moved home fires this, after the tips were taken and before anything is planned.
	writeFileSync(hook, `#!/bin/sh\n[ "$1" = committed ] || exit 0\ncase "$(cat)" in *refs/remotes/origin/main*) ;; *) exit 0;; esac\n[ -e "${guard}" ] && exit 0\n: > "${guard}"\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE\ncd "${scope}" && echo late > late.md && git add -A && git -c user.name=O -c user.email=o@example.com commit -qm made-after-the-tips\nexit 0\n`, { mode: 0o755 });
	await assert.rejects(land({}, f.ctx), /gained commits while this run was publishing/);
	assert.equal(f.remoteRef("refs/heads/work/ideas"), "", "nothing was published");
});

test("a hero commit made between reading the dive and taking the tips is refused, not published under the older read", async () => {
	const f = fixture("land-hero-after-read");
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	const heroRemote = git(f.hero, "remote", "get-url", "origin");
	let done = false;
	// The cape's version is read right after the dive is, before the run takes its tips: a commit lands in between.
	const cape = { ...f.ctx.capes[0]! };
	Object.defineProperty(cape, "version", {
		get() {
			if (!done) {
				done = true;
				writeFileSync(join(f.hero, "late-hero.md"), "made after the dive was read\n");
				git(f.hero, "add", "-A");
				git(f.hero, "commit", "-q", "-m", "late hero work");
			}
			return "test";
		},
	});
	await assert.rejects(land({}, { ...f.ctx, capes: [cape, ...f.ctx.capes.slice(1)] }), /gained commits while this run was publishing/);
	assert.equal(f.remoteRef("refs/heads/work/ideas"), "", "nothing was published");
	assert.equal(spawnSync("git", ["cat-file", "-e", "refs/heads/main:late-hero.md"], { cwd: heroRemote }).status === 0, false);
});

// Turns reach the home only in the record pack pushes (turns-publish-when)

const sections = (text: string, label: string) => (text.match(new RegExp(`^## \\S+ ${label}$`, "gm")) ?? []).length;

test("the record it pushes holds every turn on the dive branch, once, and counts them", async () => {
	const f = fixture("pack-turns");
	await jump({ ref: f.featId }, f.ctx);
	const t = await turner(f);
	const origin = git(f.hero, "remote", "get-url", "origin");
	const base = git(origin, "rev-parse", "refs/heads/main");
	await t.turn("One.", "First");
	await t.turn("Two.", "Second");
	assert.equal(git(origin, "rev-parse", "refs/heads/main"), base, "the turns are not on the home before the pack");

	await pack({}, t.plain);

	const doc = git(origin, "show", `refs/heads/main:kb/${t.id}.md`);
	assert.equal(sections(doc, "First"), 1);
	assert.equal(sections(doc, "Second"), 1);
	assert.equal(sections(doc, "packed"), 1);
	assert.ok(doc.indexOf("One.") < doc.indexOf("Two.") && doc.indexOf("Two.") < doc.indexOf("put it down."));
	assert.match(doc, /\n- hero: 2 commits kept on refs\/nosedive\/[^\n]+\n- turns: 2$/);
	assert.equal(git(origin, "rev-list", "--count", `${base}..refs/heads/main`), "1", "one record commit holds the turns");
	assert.match(git(origin, "log", "-1", "--format=%s", "refs/heads/main"), /^pack\(.+\): diver@example\.com put it down$/);
	assert.equal(f.doc(t.id), doc + "\n", "the hero's copy is the home's");
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "main");
	assert.equal(git(f.hero, "rev-parse", "main"), git(origin, "rev-parse", "refs/heads/main"));
});

test("a dive in flight with turns already on the home is not doubled, and still packs every turn", async () => {
	const f = fixture("pack-turns-on-main");
	await jump({ ref: f.featId }, f.ctx);
	const t = await turner(f);
	const origin = git(f.hero, "remote", "get-url", "origin");
	const base = git(origin, "rev-parse", "refs/heads/main");
	const first = await t.turn("One.", "First");
	const branch = git(f.hero, "symbolic-ref", "--short", "HEAD");
	// As a turn put it on the home before turns waited for put-down: a copy of the commit, pushed.
	onOrigin(f, (clone) => {
		git(clone, "fetch", "-q", f.hero, branch);
		git(clone, "cherry-pick", first);
	});
	await t.turn("Two.", "Second");

	await pack({}, t.plain);

	const doc = git(origin, "show", `refs/heads/main:kb/${t.id}.md`);
	assert.equal(sections(doc, "First"), 1, "the turn the home had is not repeated");
	assert.equal(sections(doc, "Second"), 1);
	assert.match(doc, /\n- turns: 2$/);
	assert.equal(git(origin, "rev-list", "--count", `${base}..refs/heads/main`), "2", "the turn's copy and the record");
});

test("refuses, changing nothing, when the home's copy of the dive doc changed since the dive began", async () => {
	const f = fixture("pack-moved");
	await jump({ ref: f.featId }, f.ctx);
	const t = await turner(f);
	const origin = git(f.hero, "remote", "get-url", "origin");
	await t.turn("One.", "First");
	onOrigin(f, (clone) => {
		const path = join(clone, "kb", `${t.id}.md`);
		writeFileSync(path, `${readFileSync(path, "utf8")}\nA note from elsewhere.\n`);
		git(clone, "commit", "-qam", "note on the dive");
	});
	const moved = git(origin, "rev-parse", "refs/heads/main");
	const branch = git(f.hero, "symbolic-ref", "--short", "HEAD");
	const head = git(f.hero, "rev-parse", "HEAD");
	const main = git(f.hero, "rev-parse", "main");
	const doc = f.doc(t.id);
	const status = git(f.hero, "status", "--porcelain");
	const checkout = git(f.checkout, "rev-parse", "HEAD");

	await assert.rejects(pack({}, t.plain), (error: Error) => {
		const short = git(f.hero, "rev-parse", "--short", moved);
		assert.equal(error.message, `kb/${t.id}.md on main changed since this dive began, by ${short} note on the dive, so nothing was put down and every turn is still on ${branch}: revert that change on main, or ask whoever made it to, then run \`nosedive pack\` again`);
		return true;
	});

	assert.equal(git(origin, "rev-parse", "refs/heads/main"), moved, "nothing was pushed");
	assert.equal(git(origin, "for-each-ref", "refs/nosedive"), "");
	assert.equal(git(f.remote, "for-each-ref", "refs/nosedive"), "");
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branch, "the dive is still on deck");
	assert.equal(git(f.hero, "rev-parse", "HEAD"), head);
	assert.equal(git(f.hero, "rev-parse", "main"), main);
	assert.equal(f.doc(t.id), doc);
	assert.equal(git(f.hero, "status", "--porcelain"), status);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), checkout);
	assert.equal(sections(git(f.hero, "show", `${branch}:kb/${t.id}.md`), "First"), 1, "the turn is on the dive branch");
});

test("a land rerun replays the turns written after the failed run, and the home's record keeps the ones it had", async () => {
	const f = fixture("land-rerun-turns");
	await jump({ ref: f.featId }, f.ctx);
	const t = await turner(f);
	f.commit("idea.md", "an idea\n");
	const heroRemote = git(f.hero, "remote", "get-url", "origin");
	const legacy = `refs/nosedive/dives/${f.heroId}/main/${t.id}`;
	git(f.hero, "push", "-q", "origin", `HEAD:${legacy}`);
	const hook = rejectDelete(heroRemote, legacy);
	await t.turn("One.", "First");
	await assert.rejects(land({}, t.plain), /injected deletion failure/);
	assert.equal(sections(git(heroRemote, "show", `refs/heads/main:kb/${t.id}.md`), "First"), 1, "the failed run's record holds the first turn");
	assert.equal(sections(git(heroRemote, "show", `refs/heads/main:kb/${t.id}.md`), "Second"), 0);

	await t.turn("Two.", "Second");
	writeFileSync(join(f.hero, "late-hero.md"), "hero work after the failure\n");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-q", "-m", "late hero work");
	unlinkSync(hook);
	f.out.length = 0;
	await land({}, t.plain);

	const doc = git(heroRemote, "show", `refs/heads/main:kb/${t.id}.md`);
	assert.equal(sections(doc, "First"), 1);
	assert.equal(sections(doc, "Second"), 1, "the turn written after the failed run is not lost");
	assert.equal(sections(doc, "landed"), 1, "no second record");
	assert.ok(doc.indexOf("One.") < doc.indexOf("landed it.") && doc.indexOf("landed it.") < doc.indexOf("Two."));
	assert.equal(git(heroRemote, "show", "refs/heads/main:late-hero.md"), "hero work after the failure");
	assert.match(f.out.join("\n"), /- turns written after the failed land: 1/);
	assert.equal(git(f.hero, "rev-parse", "main"), git(heroRemote, "rev-parse", "refs/heads/main"));
	assert.equal(f.doc(t.id), doc + "\n");
	assert.equal(git(heroRemote, "for-each-ref", legacy), "", "the cleanup finished");
	assert.throws(() => f.onDeck(), "the dive is over");
});
