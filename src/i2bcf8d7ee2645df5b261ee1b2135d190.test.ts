// land [<dive>]
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { i0735c57383365d4ca5395ea24f5b0649 as pack } from "./i0735c57383365d4ca5395ea24f5b0649.ts";
import { i2bcf8d7ee2645df5b261ee1b2135d190 as land } from "./i2bcf8d7ee2645df5b261ee1b2135d190.ts";
import { fixture, git } from "../test/harness.ts";

const nosedive = "Co-Authored-By: nosedive test <noreply@nosedive.dev>";

test("stamps and pushes the work to its feat's branch and the hero's to its home between its jump and land records, deletes the dive's refs and branches, leaves the checkout detached and the hero home, and ends the dive", async () => {
	const f = fixture("land");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	for (const [file, trailer] of [["old.md", "Co-Authored-By: nosedive 0.0.1 <noreply@nosedive.dev>"], ["ann.md", "Co-Authored-By: Ann <ann@example.com>"]]) {
		writeFileSync(join(f.checkout, file), "x\n");
		git(f.checkout, "add", "-A");
		git(f.checkout, "commit", "-q", "-m", `add ${file}\n\n${trailer}`);
	}
	f.commit("idea.md", "an idea\n");
	const author = git(f.checkout, "log", "-1", "--format=%an %ae %aI");
	writeFileSync(join(f.hero, "kb", "note.md"), "a note\n");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-q", "-m", "a note");
	await pack({}, f.ctx);
	git(f.remote, "update-ref", `refs/nosedive/dives/${f.heroId}/main/${id}`, git(f.checkout, "rev-parse", "HEAD"));
	assert.match(git(f.hero, "log", "-1", "--format=%s"), /^pack\(ideas\.[0-9a-f]{6}\): diver@example\.com put it down$/);
	assert.equal(git(f.hero, "log", "-1", "--format=%(trailers:only,unfold)"), nosedive, "pack's record says nosedive made it");
	await jump({ ref: id }, f.ctx);

	await land({}, f.ctx);
	const head = git(f.checkout, "rev-parse", "HEAD");
	assert.equal(f.remoteRef("refs/heads/work/ideas"), head);
	const trailers = `Nosedive-Dive: ${id}\nNosedive-Feat: ${f.featId}\n${nosedive}`;
	assert.equal(git(f.checkout, "log", "-1", "--format=%(trailers:only,unfold)"), trailers);
	assert.equal(git(f.checkout, "log", "-1", "--format=%(trailers:only,unfold)", "HEAD~2"), `Co-Authored-By: nosedive 0.0.1 <noreply@nosedive.dev>\nNosedive-Dive: ${id}\nNosedive-Feat: ${f.featId}`, "a commit that has a nosedive co-author gets no second");
	assert.equal(git(f.checkout, "log", "-1", "--format=%(trailers:only,unfold)", "HEAD~1"), `Co-Authored-By: Ann <ann@example.com>\n${trailers}`, "another's does not stand in for it");
	assert.match(git(f.hero, "log", "-1", "--format=%s"), /^land\(ideas\.[0-9a-f]{6}\): diver@example\.com landed it$/);
	assert.equal(git(f.hero, "log", "-1", "--format=%(trailers:only,unfold)"), nosedive);
	assert.equal(git(f.checkout, "log", "-1", "--format=%s"), "add idea.md");
	assert.equal(git(f.checkout, "log", "-1", "--format=%an %ae %aI"), author, "the same author");
	assert.equal(git(f.remote, "for-each-ref", "refs/nosedive"), "", "the dive's refs are gone, under its old name too");
	assert.equal(git(f.hero, "ls-remote", "origin", `refs/nosedive/${f.heroId}/dives/*`), "", "the hero's too");
	const trunk = git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0];
	assert.equal(git(f.hero, "rev-parse", "HEAD"), trunk, "the hero's work and record are on trunk");
	assert.equal(git(f.hero, "log", "-1", "--format=%(trailers:only,unfold)", "HEAD^"), trailers, "the hero's work is stamped too");
	assert.match(git(f.hero, "log", "-1", "--format=%s", "HEAD~2"), /^jump\(ideas\.[0-9a-f]{6}\): /, "bookended by the jump and land records");
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "main", "the hero back home");
	assert.equal(git(f.hero, "branch", "--list", `nosedive-*-${id}`), "", "its dive branch gone");
	assert.match(f.doc(id), new RegExp(`\\nmeta:\\n {2}feat: [0-9a-f-]{36}\\n {2}outcome: landed\\n[^]*\\n## \\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z landed\\n\\ndiver@example\\.com landed it\\.\\n\\n- data: pushed ${head.slice(0, 7)} to work/ideas\\n- hero: 1 commit onto main\\n$`));
	assert.doesNotMatch(f.doc(id), /ref:/, "its refs are gone, so is their record");
	assert.equal(spawnSync("git", ["symbolic-ref", "-q", "HEAD"], { cwd: f.checkout }).status, 1, "detached");
	assert.equal(git(f.checkout, "branch", "--list", `*/${id}`), "", "its branch is gone");

	await jump({ ref: f.featId, sure: true }, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), head, "a feat's dives stack on its branch");
});

test("refuses uncommitted changes, and a branch that moved past the work", async () => {
	const f = fixture("land-refusals");
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	writeFileSync(join(f.checkout, "draft.md"), "draft\n");
	await assert.rejects(land({}, f.ctx), /nothing was landed:\n {2}workspace\/data has uncommitted changes: commit them first/);
	git(f.checkout, "clean", "-qf");

	const other = join(f.hero, "..", "other");
	git(f.hero, "clone", "-q", f.remote, other);
	git(other, "-c", "user.name=O", "-c", "user.email=o@example.com", "commit", "-q", "--allow-empty", "-m", "theirs");
	git(other, "push", "-q", "origin", "HEAD:refs/heads/work/ideas");
	await assert.rejects(land({}, f.ctx), new RegExp(`work/ideas in data has moved to \\w{7}, which this dive's work does not contain: pack, then jump ${f.onDeck()}`));
	assert.equal(f.remoteRef("refs/heads/work/ideas"), git(other, "rev-parse", "HEAD"));
});
