// bail [<dive>] --reason <why>
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { iffc777778a63553ba90babcc038eb748 as bail } from "./iffc777778a63553ba90babcc038eb748.ts";
import { fixture, git, moveHomeWhenScopePushed, onOrigin, turner } from "../test/harness.ts";

test("keeps what the dive held on its ref, uncommitted work included, records why, leaves the checkout at its base, and ends it", async () => {
	const f = fixture("bail");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const base = git(f.checkout, "rev-parse", "HEAD");
	f.commit("idea.md", "an idea\n");
	const short = git(f.checkout, "rev-parse", "--short", "HEAD");
	writeFileSync(join(f.checkout, "draft.md"), "half\n");

	await bail({ reason: "a better idea came along" }, f.ctx);
	const ref = `refs/nosedive/${f.heroId}/dives/${id}`;
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), base);
	assert.equal(git(f.remote, "log", "-1", "--format=%s", ref), `pack(${id.slice(-6)}.ideas): work in progress`, "nothing it held is lost");
	assert.equal(git(f.remote, "log", "-1", "--format=%(trailers:only,unfold)", ref), "Co-Authored-By: nosedive test <noreply@nosedive.dev>", "and says nosedive made it, once");
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), `bail(${id.slice(-6)}.ideas): a better idea came along`);
	assert.equal(git(f.hero, "log", "-1", "--format=%(trailers:only,unfold)"), "Co-Authored-By: nosedive test <noreply@nosedive.dev>");
	assert.equal(git(f.checkout, "branch", "--list", `*/${id}`), "", "its branch is gone");
	const doc = f.doc(id);
	assert.match(doc, /\nmeta:\n {2}feat: [0-9a-f-]{36}\n {2}outcome: bailed\n/);
	assert.match(doc, new RegExp(`\\n## \\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z bailed\\n\\ndiver@example\\.com bailed: a better idea came along\\n\\n- data: held ${short} add idea\\.md; \\w+ pack\\(${id.slice(-6)}\\.ideas\\): work in progress, kept on ${ref}\\n- hero: held no commits\\n$`));
	assert.throws(() => f.onDeck());
	await assert.rejects(jump({ ref: id }, f.ctx), /is over: it bailed/);
});

test("needs a reason", async () => {
	const f = fixture("bail-reason");
	await assert.rejects(bail({ reason: " " }, f.ctx), /bail needs a reason/);
});

test("bails without atomic-push support at the origin", async () => {
	const f = fixture("bail-no-atomic");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const committed = f.commit("idea.md", "an idea\n");
	git(f.remote, "config", "receive.advertiseAtomic", "false");

	await bail({ reason: "no longer needed" }, f.ctx);

	assert.equal(f.remoteRef(`refs/nosedive/${f.heroId}/dives/${id}`), committed);
	assert.throws(() => f.onDeck());
});

test("bail's usage binds --reason as reason, the key bail reads (bail-reason-binding)", async () => {
	const { i01a1335482437c9eb145885f65f12aa1: matchUsage } = await import("nosedive-core");
	assert.equal(matchUsage(["bail [<dive>] --reason <why>"], ["bail", "--reason", "gone stale"]).args.reason, "gone stale");
});

// Turns reach the home only in the record bail pushes (turns-publish-when)

const sections = (text: string, label: string) => (text.match(new RegExp(`^## \\S+ ${label}$`, "gm")) ?? []).length;

test("the record it pushes holds every turn on the dive branch, once, and counts them", async () => {
    const f = fixture("bail-turns");
    await jump({ ref: f.featId }, f.ctx);
    const t = await turner(f);
    const origin = git(f.hero, "remote", "get-url", "origin");
    const base = git(origin, "rev-parse", "refs/heads/main");
    await t.turn("One.", "First");
    await t.turn("Two.", "Second");
    assert.equal(git(origin, "rev-parse", "refs/heads/main"), base, "the turns are not on the home before the bail");

    await bail({ reason: "a better idea came along" }, t.plain);

    const doc = git(origin, "show", `refs/heads/main:kb/${t.id}.md`);
    assert.equal(sections(doc, "First"), 1);
    assert.equal(sections(doc, "Second"), 1);
    assert.equal(sections(doc, "bailed"), 1);
    assert.ok(doc.indexOf("One.") < doc.indexOf("Two.") && doc.indexOf("Two.") < doc.indexOf("bailed: a better idea"));
    assert.match(doc, /\n- hero: held [^\n]+\n- turns: 2$/);
    assert.equal(git(origin, "rev-list", "--count", `${base}..refs/heads/main`), "1", "one record commit holds the turns");
    assert.equal(git(origin, "log", "-1", "--format=%s", "refs/heads/main"), `bail(${t.id.slice(-6)}.ideas): a better idea came along`);
    assert.throws(() => f.onDeck());
});

test("refuses, changing nothing and throwing no turn away, when the home's copy of the dive doc changed since the dive began", async () => {
    const f = fixture("bail-moved");
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

    await assert.rejects(bail({ reason: "stuck" }, t.plain), (error: Error) => {
        const short = git(f.hero, "rev-parse", "--short", moved);
        assert.equal(error.message, `kb/${t.id}.md on main changed since this dive began, by ${short} note on the dive, so nothing was put down and every turn is still on ${branch}: revert that change on main, or ask whoever made it to, then run \`nosedive bail\` again`);
        return true;
    });

    assert.equal(git(origin, "rev-parse", "refs/heads/main"), moved);
    assert.equal(git(origin, "for-each-ref", "refs/nosedive"), "");
    assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branch, "the dive is still on deck");
    assert.equal(git(f.hero, "rev-parse", "HEAD"), head);
    assert.equal(sections(f.doc(t.id), "First"), 1, "the turn is on the dive branch");
    assert.equal(sections(f.doc(t.id), "bailed"), 0);
});

test("a home whose copy of the dive doc moves after the earlier pushes is reported as partly done, throwing no turn away; the rerun refuses the same way until the change is reverted, then finishes", async () => {
    const f = fixture("bail-window");
    await jump({ ref: f.featId }, f.ctx);
    const t = await turner(f);
    const origin = git(f.hero, "remote", "get-url", "origin");
    await t.turn("One.", "First");
    const committed = f.commit("idea.md", "an idea\n");
    const ref = `refs/nosedive/${f.heroId}/dives/${t.id}`;
    moveHomeWhenScopePushed(f, (clone) => {
        const path = join(clone, "kb", `${t.id}.md`);
        writeFileSync(path, `${readFileSync(path, "utf8")}\nA note from elsewhere.\n`);
        git(clone, "commit", "-qam", "note on the dive");
    });
    const branch = git(f.hero, "symbolic-ref", "--short", "HEAD");
    const message = () => {
        const short = git(f.hero, "rev-parse", "--short", git(origin, "rev-parse", "refs/heads/main"));
        return `kb/${t.id}.md on main changed since this dive began, by ${short} note on the dive, and part of the work is published already, so bail is only partly done. Published: data ${ref} at ${committed.slice(0, 7)}; hero ${ref} at ${git(origin, "rev-parse", ref).slice(0, 7)}. Not published: the record on main. Every turn is still on ${branch} and that change on main is untouched. Running \`nosedive bail --reason "stuck"\` again refuses the same way until that change is reverted on main: revert it, or ask whoever made it to, then run \`nosedive bail --reason "stuck"\` again to finish it`;
    };

    await assert.rejects(bail({ reason: "stuck" }, t.plain), (error: Error) => {
        assert.equal(error.message, message());
        return true;
    });

    const moved = git(origin, "rev-parse", "refs/heads/main");
    assert.equal(git(origin, "log", "-1", "--format=%s", moved), "note on the dive", "the other edit is the home's tip, not overwritten");
    assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branch, "the dive is still on deck");
    assert.equal(sections(git(f.hero, "show", `${branch}:kb/${t.id}.md`), "First"), 1, "the turn is on the dive branch");

    await assert.rejects(bail({ reason: "stuck" }, t.plain), (error: Error) => {
        assert.equal(error.message, message());
        return true;
    });
    assert.equal(git(origin, "rev-parse", "refs/heads/main"), moved, "the rerun pushed nothing over the other edit");

    onOrigin(f, (clone) => git(clone, "revert", "--no-edit", "HEAD"));
    await bail({ reason: "stuck" }, t.plain);

    const doc = git(origin, "show", `refs/heads/main:kb/${t.id}.md`);
    assert.equal(sections(doc, "First"), 1, "the turn is in the record");
    assert.equal(sections(doc, "bailed"), 1);
    assert.equal(f.remoteRef(ref), committed, "the work is kept");
    assert.throws(() => f.onDeck(), "nothing is held");
});
