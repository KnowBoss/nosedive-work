// land [<dive>]
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { i0735c57383365d4ca5395ea24f5b0649 as pack } from "./i0735c57383365d4ca5395ea24f5b0649.ts";
import { i2bcf8d7ee2645df5b261ee1b2135d190 as land } from "./i2bcf8d7ee2645df5b261ee1b2135d190.ts";
import { fixture, git, moveHomeWhenScopePushed, onOrigin, turner } from "../test/harness.ts";

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
	assert.match(git(f.hero, "log", "-1", "--format=%s"), /^pack\([0-9a-f]{6}\.ideas\): diver@example\.com put it down$/);
	assert.equal(git(f.hero, "log", "-1", "--format=%(trailers:only,unfold)"), nosedive, "pack's record says nosedive made it");
	await jump({ ref: id }, f.ctx);

	await land({}, f.ctx);
	const head = git(f.checkout, "rev-parse", "HEAD");
	assert.equal(f.remoteRef("refs/heads/work/ideas"), head);
	const trailers = `Nosedive-Dive: ${id}\nNosedive-Feat: ${f.featId}\n${nosedive}`;
	assert.equal(git(f.checkout, "log", "-1", "--format=%(trailers:only,unfold)"), trailers);
	assert.equal(git(f.checkout, "log", "-1", "--format=%(trailers:only,unfold)", "HEAD~2"), `Co-Authored-By: nosedive 0.0.1 <noreply@nosedive.dev>\nNosedive-Dive: ${id}\nNosedive-Feat: ${f.featId}`, "a commit that has a nosedive co-author gets no second");
	assert.equal(git(f.checkout, "log", "-1", "--format=%(trailers:only,unfold)", "HEAD~1"), `Co-Authored-By: Ann <ann@example.com>\n${trailers}`, "another's does not stand in for it");
	assert.match(git(f.hero, "log", "-1", "--format=%s"), /^land\([0-9a-f]{6}\.ideas\): diver@example\.com landed it$/);
	assert.equal(git(f.hero, "log", "-1", "--format=%(trailers:only,unfold)"), nosedive);
	assert.equal(git(f.checkout, "log", "-1", "--format=%s"), "add idea.md");
	assert.equal(git(f.checkout, "log", "-1", "--format=%an %ae %aI"), author, "the same author");
	assert.equal(git(f.remote, "for-each-ref", "refs/nosedive"), "", "the dive's refs are gone, under its old name too");
	assert.equal(git(f.hero, "ls-remote", "origin", `refs/nosedive/${f.heroId}/dives/*`), "", "the hero's too");
	const trunk = git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0];
	assert.equal(git(f.hero, "rev-parse", "HEAD"), trunk, "the hero's work and record are on trunk");
	assert.equal(git(f.hero, "log", "-1", "--format=%(trailers:only,unfold)", "HEAD^"), trailers, "the hero's work is stamped too");
	assert.match(git(f.hero, "log", "-1", "--format=%s", "HEAD~2"), /^jump\([0-9a-f]{6}\.ideas\): /, "bookended by the jump and land records");
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "main", "the hero back home");
	assert.equal(git(f.hero, "branch", "--list", `nosedive-*-${id}`), "", "its dive branch gone");
	assert.match(f.doc(id), new RegExp(`\\nmeta:\\n {2}feat: [0-9a-f-]{36}\\n {2}outcome: landed\\n[^]*\\n## \\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z landed\\n\\ndiver@example\\.com landed it\\.\\n\\n- data: pushed ${head.slice(0, 7)} to work/ideas\\n- hero: 1 commit onto main\\n$`));
	assert.doesNotMatch(f.doc(id), /ref:/, "its refs are gone, so is their record");
	assert.equal(spawnSync("git", ["symbolic-ref", "-q", "HEAD"], { cwd: f.checkout }).status, 1, "detached");
	assert.equal(git(f.checkout, "branch", "--list", `*/${id}`), "", "its branch is gone");

	await jump({ ref: f.plan() }, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), head, "a feat's dives stack on its branch");
});
// Turns reach the home only in the record land pushes (turns-publish-when)

const sections = (text: string, label: string) => (text.match(new RegExp(`^## \\S+ ${label}$`, "gm")) ?? []).length;
const heroWork = (f: ReturnType<typeof fixture>, name: string) => {
	writeFileSync(join(f.hero, `${name}.txt`), name);
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-qm", `hero ${name}`);
};

test("two turns with hero commits before, between and after land with each section once and no empty commit", async () => {
	const f = fixture("land-defect");
	await jump({ ref: f.featId }, f.ctx);
	const t = await turner(f);
	const origin = git(f.hero, "remote", "get-url", "origin");
	const base = git(origin, "rev-parse", "refs/heads/main");
	heroWork(f, "a");
	await t.turn("One.", "First");
	heroWork(f, "b");
	await t.turn("Two.", "Second");
	heroWork(f, "c");

	await land({}, t.plain);

	const doc = git(origin, "show", `refs/heads/main:kb/${t.id}.md`);
	assert.equal(sections(doc, "First"), 1);
	assert.equal(sections(doc, "Second"), 1);
	assert.equal(sections(doc, "landed"), 1);
	const commits = git(origin, "rev-list", "--reverse", `${base}..refs/heads/main`).split("\n");
	assert.deepEqual(commits.slice(0, 3).map((commit) => git(origin, "log", "-1", "--format=%s", commit)), ["hero a", "hero b", "hero c"], "the hero's work, the turns left out");
	assert.equal(commits.length, 4, "and one record");
	for (const commit of commits) assert.notEqual(git(origin, "diff-tree", "--no-commit-id", "--name-only", "-r", commit), "", `${commit} changes something`);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "main");
	assert.equal(git(f.hero, "rev-parse", "main"), git(origin, "rev-parse", "refs/heads/main"));
	assert.equal(f.doc(t.id), doc + "\n");
});

test("a dive in flight with a turn already on the home lands without doubling it", async () => {
	const f = fixture("land-turns-on-main");
	await jump({ ref: f.featId }, f.ctx);
	const t = await turner(f);
	const origin = git(f.hero, "remote", "get-url", "origin");
	const base = git(origin, "rev-parse", "refs/heads/main");
	heroWork(f, "a");
	const first = await t.turn("One.", "First");
	const branch = git(f.hero, "symbolic-ref", "--short", "HEAD");
	// As a turn put it on the home before turns waited for put-down: a copy of the commit, pushed.
	onOrigin(f, (clone) => {
		git(clone, "fetch", "-q", f.hero, branch);
		git(clone, "cherry-pick", first);
	});
	await t.turn("Two.", "Second");

	await land({}, t.plain);

	const doc = git(origin, "show", `refs/heads/main:kb/${t.id}.md`);
	assert.equal(sections(doc, "First"), 1, "the turn the home had is not repeated");
	assert.equal(sections(doc, "Second"), 1);
	assert.equal(sections(doc, "landed"), 1);
	assert.match(doc, /\n- turns: 2$/);
	assert.equal(git(origin, "log", "--format=%s", `${base}..refs/heads/main`).split("\n").filter((subject) => subject.startsWith("hero ")).length, 1, "the hero's commit once");
	assert.equal(git(f.hero, "rev-parse", "main"), git(origin, "rev-parse", "refs/heads/main"));
});

test("refuses, changing nothing, when the home's copy of the dive doc changed since the dive began", async () => {
	const f = fixture("land-moved");
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
	const doc = f.doc(t.id);

	await assert.rejects(land({}, t.plain), (error: Error) => {
		const short = git(f.hero, "rev-parse", "--short", moved);
		assert.equal(error.message, `kb/${t.id}.md on main changed since this dive began, by ${short} note on the dive, so nothing was landed and every turn is still on ${branch}: revert that change on main, or ask whoever made it to, then run \`nosedive land\` again`);
		return true;
	});

	assert.equal(git(origin, "rev-parse", "refs/heads/main"), moved, "nothing was pushed");
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branch, "the dive is still on deck");
	assert.equal(git(f.hero, "rev-parse", "HEAD"), head);
	assert.equal(f.doc(t.id), doc);
	assert.equal(sections(git(f.hero, "show", `${branch}:kb/${t.id}.md`), "First"), 1, "the turn is on the dive branch");
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
test("a home whose copy of the dive doc moves after the work branch is pushed is reported as partly landed, naming what was published and what was not, overwriting nothing; the rerun refuses the same way until the change is reverted, then finishes without doubling the work", async () => {
    const f = fixture("land-window");
    await jump({ ref: f.featId }, f.ctx);
    const t = await turner(f);
    const origin = git(f.hero, "remote", "get-url", "origin");
    await t.turn("One.", "First");
    f.commit("idea.md", "an idea\n");
    moveHomeWhenScopePushed(f, (clone) => {
        const path = join(clone, "kb", `${t.id}.md`);
        writeFileSync(path, `${readFileSync(path, "utf8")}\nA note from elsewhere.\n`);
        git(clone, "commit", "-qam", "note on the dive");
    });
    const branch = git(f.hero, "symbolic-ref", "--short", "HEAD");
    const message = () => {
        const short = git(f.hero, "rev-parse", "--short", git(origin, "rev-parse", "refs/heads/main"));
        return `kb/${t.id}.md on main changed since this dive began, by ${short} note on the dive, and part of the work is published already, so land is only partly done. Published: data work/ideas at ${f.remoteRef("refs/heads/work/ideas").slice(0, 7)}. Not published: the hero's work and the land record on main. Every turn is still on ${branch} and that change on main is untouched. Running \`nosedive land\` again refuses the same way until that change is reverted on main: revert it, or ask whoever made it to, then run \`nosedive land\` again to finish it`;
    };

    await assert.rejects(land({}, t.plain), (error: Error) => {
        assert.equal(error.message, message());
        return true;
    });

    const moved = git(origin, "rev-parse", "refs/heads/main");
    const published = f.remoteRef("refs/heads/work/ideas");
    assert.equal(git(origin, "log", "-1", "--format=%s", moved), "note on the dive", "the other edit is the home's tip, not overwritten");
    assert.equal(sections(git(origin, "show", `${moved}:kb/${t.id}.md`), "landed"), 0, "no record was pushed");
    assert.notEqual(published, "", "the work branch is published");
    assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branch, "the dive is still on deck");
    assert.equal(sections(git(f.hero, "show", `${branch}:kb/${t.id}.md`), "First"), 1, "the turn is on the dive branch");

    await assert.rejects(land({}, t.plain), (error: Error) => {
        assert.equal(error.message, message());
        return true;
    });
    assert.equal(git(origin, "rev-parse", "refs/heads/main"), moved, "the rerun pushed nothing over the other edit");
    assert.equal(f.remoteRef("refs/heads/work/ideas"), published);

    onOrigin(f, (clone) => git(clone, "revert", "--no-edit", "HEAD"));
    await land({}, t.plain);

    const doc = git(origin, "show", `refs/heads/main:kb/${t.id}.md`);
    assert.equal(sections(doc, "First"), 1);
    assert.equal(sections(doc, "landed"), 1);
    assert.doesNotMatch(doc, /A note from elsewhere\./, "the change was reverted, as the message asked");
    assert.equal(f.remoteRef("refs/heads/work/ideas"), published, "the work was not stamped twice");
    assert.equal(git(f.remote, "rev-list", "--count", "refs/heads/main..refs/heads/work/ideas"), "1");
    assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "main");
    assert.throws(() => f.onDeck(), "nothing is held");
});