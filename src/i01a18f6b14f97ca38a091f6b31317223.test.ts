import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import * as core from "nosedive-core";
import type { Cape } from "nosedive-core";
import { i01a1335480147d0686528aee80f8ee34 as namespacedUuid, i01a1335480c776ba8945020d0af333eb as mintUuid, i01a1335487e477549d84a6fc2c901bf6 as describeCape, i01a1336a958f71c7beec4db3195c7966 as launch } from "nosedive-core";
import { fixture, git } from "../test/harness.ts";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { i0735c57383365d4ca5395ea24f5b0649 as pack } from "./i0735c57383365d4ca5395ea24f5b0649.ts";
import { i2bcf8d7ee2645df5b261ee1b2135d190 as land } from "./i2bcf8d7ee2645df5b261ee1b2135d190.ts";
import { i01a1b45b04a079a494fed25a3665456d as diveShape } from "./i01a1b45b04a079a494fed25a3665456d.ts";
import { i01a18f4542c670ccb111f6bd564e1f50 as turn } from "./i01a18f4542c670ccb111f6bd564e1f50.ts";

const TURN = "01a18f45-42c6-70cc-b111-f6bd564e1f50";
const DIVE_SHAPE = "01a1b45b-04a0-79a4-94fe-d25a3665456d";
const source = describeCape(dirname(dirname(fileURLToPath(import.meta.url))));
const timestamp = /^## (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d))(?: (.*))?$/m;

async function setup(label: string) {
	const f = fixture(`turn-${label}`);
	await jump({ ref: f.featId }, f.ctx);
	const plain = { ...f.ctx };
	const work = f.ctx.capes[1]!;
	const dive = work.kinds.dive as Record<string, unknown>;
	const declaredDive = source.kinds.dive as Record<string, unknown>;
	const cape: Cape = {
		...work,
		docs: source.docs,
		index: { [namespacedUuid(TURN, work.id)]: turn, [namespacedUuid(DIVE_SHAPE, work.id)]: diveShape },
		kinds: { ...work.kinds, dive: { ...dive, links: declaredDive.links } },
	};
	f.ctx.capes = [core as Cape, cape];
	const id = f.onDeck();
	const run = (args: string[]) => launch(["pass", "--turn", id, ...args], f.ctx);
	// `plain` is the ctx as the fixture made it, for the loop's own actions (jump, pack, land); `run` runs pass with core and the cape.
	return { ...f, id, run, plain };
}

for (const { label, args, content, headingLabel } of [
	{ label: "summary", args: ["Implemented the gate."], content: "Implemented the gate.", headingLabel: undefined },
	{ label: "next", args: ["--next", "Run the tests"], content: "Next: Run the tests", headingLabel: undefined },
	{ label: "both", args: ["Implemented the gate.", "--next", "Run the tests"], content: "Implemented the gate.\nNext: Run the tests", headingLabel: undefined },
	{ label: "label", args: ["Reviewed the implementation.", "--label", "Review"], content: "Reviewed the implementation.", headingLabel: "Review" },
]) {
	test(`pass --turn records ${label} through the launcher in one ordinary commit`, async () => {
		const f = await setup(label);
		const before = f.doc(f.id);
		const head = git(f.hero, "rev-parse", "HEAD");
		assert.equal(await f.run(args), 0, f.err.join("\n"));
		const text = f.doc(f.id);
		assert.ok(text.startsWith(before.trimEnd()), "the original dive remains before its appended turn");
		const appended = text.slice(before.trimEnd().length).trim();
		const match = timestamp.exec(appended);
		assert.ok(match, appended);
		assert.equal(match[2], headingLabel);
		assert.ok(Number.isFinite(Date.parse(match[1]!)));
		assert.equal(appended.slice(match[0].length).trim(), content);
		assert.equal(git(f.hero, "rev-list", "--count", `${head}..HEAD`), "1");
		assert.equal(git(f.hero, "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"), `kb/${f.id}.md`);
		assert.equal(git(f.hero, "status", "--porcelain"), "");
	});
}

test("pass --turn reads a multiline summary from stdin", async () => {
	const f = await setup("stdin");
	let reads = 0;
	f.ctx.stdin = async () => { reads++; return "First paragraph.\n\nSecond paragraph.\n"; };
	assert.equal(await f.run(["-", "--next", "Review it"]), 0, f.err.join("\n"));
	assert.equal(reads, 1);
	assert.match(f.doc(f.id), /First paragraph\.\n\nSecond paragraph\.\nNext: Review it\n$/);
});

test("pass --turn appends two turns in invocation order", async () => {
	const f = await setup("order");
	assert.equal(await f.run(["First turn", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(await f.run(["Second turn", "--label", "Second"]), 0, f.err.join("\n"));
	const text = f.doc(f.id);
	assert.equal((text.match(/^## \d{4}-\S+ (First|Second)$/gm) ?? []).length, 2);
	assert.ok(text.indexOf("First turn") < text.indexOf("Second turn"));
	assert.match(text, /First\n\nFirst turn[\s\S]*Second\n\nSecond turn\n$/);
});

test("pass --turn commits its computed turn when an editor saves after the gate's fresh read, preserving that save", async () => {
	const f = await setup("editor-race");
	const path = join(f.hero, "kb", `${f.id}.md`);
	const edited = `${readFileSync(path, "utf8").trimEnd()}\n\neditor save\n`;
	const key = namespacedUuid(TURN, f.ctx.capes[1]!.id);
	const real = f.ctx.capes[1]!.index[key] as typeof turn;
	f.ctx.capes[1]!.index[key] = (async (call: Parameters<typeof turn>[0]) => {
		await real(call);
		writeFileSync(path, edited);
	}) as never;
	assert.equal(await f.run(["stale turn"]), 0);
	assert.match(f.err.join("\n"), /warning:.*committed.*left.*file.*alone/i);
	assert.equal(readFileSync(path, "utf8"), edited);
	assert.match(git(f.hero, "show", `HEAD:kb/${f.id}.md`), /stale turn/);
	assert.doesNotMatch(git(f.hero, "show", `HEAD:kb/${f.id}.md`), /editor save/);
});

test("pass --turn commits only its computed text while editor saves at both commit windows survive", async () => {
	for (const stage of ["post-index-change", "reference-transaction"] as const) {
		const f = await setup(`editor-${stage}`);
		const path = join(f.hero, "kb", `${f.id}.md`);
		const edited = `editor save at ${stage}\n`;
		const guard = stage === "reference-transaction" ? '[ "$1" = committed ] || exit 0\n' : "";
		writeFileSync(join(f.hero, ".git", "hooks", stage), `#!/bin/sh\n${guard}printf '${edited}' > '${path.replace(/\\/g, "/")}'\n`, { mode: 0o755 });

		assert.equal(await f.run(["nosedive turn", "--label", "Race"]), 0, f.err.join("\n"));
		assert.equal(readFileSync(path, "utf8"), edited);
		assert.match(git(f.hero, "show", `HEAD:kb/${f.id}.md`), /nosedive turn/);
		assert.doesNotMatch(git(f.hero, "show", `HEAD:kb/${f.id}.md`), /editor save at/);
		assert.match(f.err.join("\n"), /warning:.*committed.*left.*file.*alone/i);
	}
});

for (const { label, args } of [
	{ label: "no content", args: [] },
	{ label: "label only", args: ["--label", "Review"] },
	{ label: "multiline next", args: ["Summary", "--next", "first\nsecond"] },
	{ label: "CR multiline next", args: ["Summary", "--next", "first\rsecond"] },
]) {
	test(`pass --turn refuses ${label} without writing or committing`, async () => {
		const f = await setup(label.replaceAll(" ", "-"));
		const before = f.doc(f.id);
		const head = git(f.hero, "rev-parse", "HEAD");
		assert.equal(await f.run(args), 1);
		assert.match(f.err.join("\n"), /gate turn failed/);
		assert.equal(f.doc(f.id), before);
		assert.equal(git(f.hero, "rev-parse", "HEAD"), head);
		assert.equal(git(f.hero, "status", "--porcelain"), "");
	});
}

test("pass --turn refuses a different canonical dive than the one on deck", async () => {
	const f = await setup("wrong-dive");
	const other = mintUuid();
	writeFileSync(join(f.hero, "kb", `${other}.md`), f.doc(f.id).replaceAll(f.id, other));
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-qm", "another dive");
	const head = git(f.hero, "rev-parse", "HEAD");
	const before = f.doc(other);
	assert.equal(await launch(["pass", "--turn", other, "Wrong dive"], f.ctx), 1);
	assert.match(f.err.join("\n"), /holds no dive|on deck|held/);
	assert.equal(f.doc(other), before);
	assert.equal(git(f.hero, "rev-parse", "HEAD"), head);
});

test("pass --turn refuses a dive held by another worktree", async () => {
	const f = await setup("unheld");
	writeFileSync(join(f.hero, "kb", `${f.id}.md`), f.doc(f.id).replace(/diver: .+/, "diver: elsewhere@example.com#other-holder"));
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-qm", "held elsewhere");
	const head = git(f.hero, "rev-parse", "HEAD");
	const before = f.doc(f.id);
	assert.equal(await f.run(["Wrong holder"]), 1);
	assert.match(f.err.join("\n"), /holds no dive|on deck|held/);
	assert.equal(f.doc(f.id), before);
	assert.equal(git(f.hero, "rev-parse", "HEAD"), head);
});


// A turn is committed on the dive branch and pushed to the dive's ref, never to the home; land, pack and bail publish it in their record (turns-publish-when, turns-pushed-where, nosedive-ref-scheme)

const heading = (text: string, label: string) => (text.match(new RegExp(`^## \\S+ ${label}$`, "gm")) ?? []).length;
const refIn = (dir: string, ref: string) => spawnSync("git", ["rev-parse", "--verify", "-q", ref], { cwd: dir, encoding: "utf8" }).stdout.trim();
/** Where another checkout's token would keep the dive's work in a repo. */
const theirRef = (id: string) => `refs/nosedive/${"a".repeat(12)}/01a15bb1-da9e-7d2d-aa82-5ee97257adc6/dive.${id}`;
/** A ref of someone else's, pushed from a scratch clone of a bare repo: a commit of its own. */
function pushTheirs(f: { hero: string }, bare: string, ref: string, label: string): string {
	const clone = join(f.hero, "..", `theirs-${label}`);
	git(f.hero, "clone", "-q", bare, clone);
	git(clone, "-c", "user.name=O", "-c", "user.email=o@example.com", "commit", "-q", "--allow-empty", "-m", `theirs ${label}`);
	git(clone, "push", "-q", "origin", `HEAD:${ref}`);
	return git(clone, "rev-parse", "HEAD");
}
/** Nothing of nosedive's is a local-only ref in a checkout: every root under refs/nosedive is a mirror of origin. */
const localRoots = (dir: string) => git(dir, "for-each-ref", "--format=%(refname)").split("\n").filter((ref) => /^refs\/nosedive-/.test(ref));

test("a turn is committed on the dive branch and pushed to the dive's ref under its token, not to the home, says so, and leaves the hero's work in progress alone", async () => {
	const f = await setup("home");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const root = join(f.hero, "kb", `${f.heroId}.md`);
	writeFileSync(root, `${readFileSync(root, "utf8")}\nedited, not staged\n`);
	writeFileSync(join(f.hero, "kb", "draft.md"), "half a thought\n");
	const status = git(f.hero, "status", "--porcelain");
	const base = git(f.hero, "rev-parse", "main");
	const ref = f.diveRef(f.id);
	assert.match(ref, /^refs\/nosedive\/[0-9a-f]{12}\/01a15bb1-da9e-7d2d-aa82-5ee97257adc6\/dive\.[0-9a-f-]{36}$/);

	assert.equal(await f.run(["Implemented the gate.", "--label", "First"]), 0, f.err.join("\n"));
	const turn = git(f.hero, "rev-parse", "HEAD");
	assert.deepEqual(f.out.slice(-1), [`turn: ${turn.slice(0, 7)} committed on the dive branch and pushed to its dive ref in hero; the home gets it only when land, pack or bail puts the dive down`]);
	assert.equal(f.err.join("\n"), "warning: uncommitted changes in hero are not backed up: a turn pushes only what is committed");
	assert.match(git(f.hero, "symbolic-ref", "--short", "HEAD"), /^nosedive-/, "the hero stays on the dive branch");
	assert.equal(git(f.hero, "rev-list", "--count", `${base}..${turn}`), "1", "one commit on the dive branch");
	assert.equal(git(f.hero, "rev-parse", "main"), base, "the home did not move");
	assert.equal(git(origin, "rev-parse", "refs/heads/main"), base, "nothing was pushed to the home");
	assert.equal(git(origin, "rev-parse", ref), turn, "the dive's ref holds the turn");
	assert.equal(git(origin, "for-each-ref", "refs/heads"), `${base} commit\trefs/heads/main`, "and no branch was made");
	assert.deepEqual(localRoots(f.hero), [], "no ref is local only");
	assert.equal(f.remoteRef(ref), "", "the scope has no work to push");
	assert.equal(git(f.hero, "diff-tree", "--no-commit-id", "--name-only", "-r", turn), `kb/${f.id}.md`, "only the dive doc changed");
	assert.equal(heading(git(f.hero, "show", `${turn}:kb/${f.id}.md`), "First"), 1);
	assert.equal(heading(git(f.hero, "show", `main:kb/${f.id}.md`), "First"), 0, "the home's copy has no turn");
	assert.equal(git(f.hero, "status", "--porcelain"), status, "the working tree's other changes are as they were");
	assert.match(readFileSync(root, "utf8"), /edited, not staged\n$/);
});

test("a turn whose push is refused or offline keeps what is committed and warns; the next turn pushes it", async () => {
	const f = await setup("no-push");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const base = git(f.hero, "rev-parse", "main");
	const ref = f.diveRef(f.id);
	const hook = join(origin, "hooks", "pre-receive");
	writeFileSync(hook, "#!/bin/sh\necho protected >&2\nexit 1\n", { mode: 0o755 });
	assert.equal(await f.run(["Refused.", "--label", "First"]), 0, f.err.join("\n"));
	assert.match(f.err.join("\n"), /warning: hero was not pushed to its dive ref \(.*protected.*\); its committed work stays on the dive branch, and a later turn, pack or land pushes it/);
	assert.equal(refIn(origin, ref), "", "nothing was pushed");

	unlinkSync(hook);
	const here = git(f.hero, "remote", "get-url", "origin");
	git(f.hero, "remote", "set-url", "origin", join(f.hero, "..", "missing.git"));
	f.err.length = 0;
	assert.equal(await f.run(["Offline.", "--label", "Second"]), 0, f.err.join("\n"));
	assert.match(f.err.join("\n"), /warning: hero was not pushed to its dive ref/);
	assert.match(f.out.slice(-1)[0]!, /committed on the dive branch, not pushed;/);

	git(f.hero, "remote", "set-url", "origin", here);
	f.err.length = 0;
	assert.equal(await f.run(["Online.", "--label", "Third"]), 0, f.err.join("\n"));
	assert.equal(f.err.join(""), "", "nothing to warn of");
	const tip = git(f.hero, "rev-parse", "HEAD");
	assert.equal(git(origin, "rev-parse", ref), tip, "the next turn pushed what the earlier ones left");
	assert.equal(git(origin, "rev-list", "--count", `${base}..${ref}`), "3");
	assert.equal(git(origin, "rev-parse", "refs/heads/main"), base);
});

test("a turn pushes each scope's committed work to its dive ref and warns of uncommitted changes, which it never commits", async () => {
	const f = await setup("scopes");
	const ref = f.diveRef(f.id);
	const committed = f.commit("idea.md", "an idea\n");
	writeFileSync(join(f.checkout, "draft.md"), "unfinished\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(f.remoteRef(ref), committed, "the scope's committed work is on its dive ref");
	assert.equal(f.remoteRef("refs/heads/work/ideas"), "", "and not on its work branch");
	assert.deepEqual(f.out.slice(-1), [`turn: ${git(f.hero, "rev-parse", "--short", "HEAD")} committed on the dive branch and pushed to its dive ref in data, hero; the home gets it only when land, pack or bail puts the dive down`]);
	assert.equal(f.err.join("\n"), "warning: uncommitted changes in data are not backed up: a turn pushes only what is committed");
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), committed, "no work-in-progress commit was made");
	assert.equal(git(f.checkout, "status", "--porcelain"), "?? draft.md");
	assert.equal(git(f.remote, "ls-tree", "--name-only", ref).includes("draft.md"), false);
	f.err.length = 0;
	git(f.checkout, "add", "-A");
	git(f.checkout, "commit", "-q", "-m", "add draft.md");
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	assert.equal(f.err.join(""), "", "nothing uncommitted, nothing to warn of");
	assert.equal(f.remoteRef(ref), git(f.checkout, "rev-parse", "HEAD"), "the committed draft follows with the next turn");
});

test("a failed scope push leaves the hero unpushed, so its ref never describes code its scope's lacks; the next turn pushes both", async () => {
	const f = await setup("scope-fails");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const ref = f.diveRef(f.id);
	const hook = join(f.remote, "hooks", "pre-receive");
	writeFileSync(hook, "#!/bin/sh\necho scope protected >&2\nexit 1\n", { mode: 0o755 });
	const committed = f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.match(f.err.join("\n"), /warning: data was not pushed to its dive ref \(.*scope protected.*\)/);
	assert.match(f.err.join("\n"), /warning: hero was not pushed to its dive ref \(a scope's work was not pushed, and the hero's ref must not describe code its scopes' refs lack\)/);
	assert.equal(refIn(origin, ref), "", "the hero is not pushed");
	assert.equal(f.remoteRef(ref), "");
	assert.equal(heading(git(f.hero, "show", `HEAD:kb/${f.id}.md`), "First"), 1, "the turn is committed");

	unlinkSync(hook);
	f.err.length = 0;
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	assert.equal(f.err.join(""), "");
	assert.equal(f.remoteRef(ref), committed);
	assert.equal(git(origin, "rev-parse", ref), git(f.hero, "rev-parse", "HEAD"));
});

test("a turn after a rebase force-pushes its own ref", async () => {
	const f = await setup("rebase-turn");
	const ref = f.diveRef(f.id);
	const first = f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(f.remoteRef(ref), first);
	git(f.checkout, "commit", "-q", "--amend", "-m", "an idea, reworded");
	const rewritten = git(f.checkout, "rev-parse", "HEAD");
	assert.notEqual(rewritten, first);
	assert.equal(spawnSync("git", ["merge-base", "--is-ancestor", first, rewritten], { cwd: f.checkout }).status, 1, "no longer a fast-forward");
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	assert.equal(f.err.join(""), "");
	assert.equal(f.remoteRef(ref), rewritten, "the rebased work replaced the old");
});

test("pack after a rebase that followed a turn's push succeeds, replacing the ref the turn left", async () => {
	const f = await setup("rebase-pack");
	const ref = f.diveRef(f.id);
	const first = f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(f.remoteRef(ref), first);
	git(f.checkout, "commit", "-q", "--amend", "-m", "an idea, reworded");
	const rewritten = git(f.checkout, "rev-parse", "HEAD");

	await pack({}, f.plain);

	assert.equal(f.remoteRef(ref), rewritten, "the rebased work is what the pack kept");
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "main");
	assert.throws(() => f.onDeck(), "nothing is held");
});

test("a second holder's checkout, under another token, pushes only its own ref: a turn and a pack overwrite nothing of its", async () => {
	const f = await setup("second-holder");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const ref = f.diveRef(f.id);
	const first = f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	// Another checkout of the same cache repo holds the dive under its token, and keeps its own ref.
	const theirs = pushTheirs(f, f.remote, theirRef(f.id), "data");
	const theirHero = pushTheirs(f, origin, theirRef(f.id), "hero");

	const more = f.commit("more.md", "more\n");
	f.err.length = 0;
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	assert.equal(f.err.join(""), "", "its push is not refused by theirs");
	assert.equal(f.remoteRef(ref), more, "this checkout's ref follows its work");
	assert.equal(f.remoteRef(theirRef(f.id)), theirs, "theirs is as they left it");
	assert.equal(git(origin, "rev-parse", theirRef(f.id)), theirHero);
	assert.notEqual(first, more);

	await pack({}, f.plain);
	assert.equal(f.remoteRef(ref), more);
	assert.equal(f.remoteRef(theirRef(f.id)), theirs, "a pack leaves it too");
	assert.equal(git(origin, "rev-parse", theirRef(f.id)), theirHero);
});

test("a pack of turns already on the dive ref keeps one record and does not double them on its ref", async () => {
	const f = await setup("pack-after-turns");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const base = git(f.hero, "rev-parse", "main");
	const ref = f.diveRef(f.id);
	const code = f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	const tip = git(f.hero, "rev-parse", "HEAD");
	assert.equal(git(origin, "rev-parse", ref), tip, "both turns are on the ref before the pack");

	await pack({}, f.plain);

	assert.equal(git(origin, "rev-parse", ref), tip, "the ref is where the turns left it");
	assert.equal(git(origin, "rev-list", "--count", `${base}..${ref}`), "2", "each turn once");
	assert.equal(f.remoteRef(ref), code);
	const doc = git(origin, "show", `refs/heads/main:kb/${f.id}.md`);
	assert.equal(heading(doc, "First"), 1);
	assert.equal(heading(doc, "Second"), 1);
	assert.match(doc, /\n- turns: 2$/);
	assert.equal(git(origin, "rev-list", "--count", `${base}..refs/heads/main`), "1", "one record commit");
	assert.equal(git(origin, "for-each-ref", "refs/nosedive", "--format=%(refname)"), ref, "no marker is left");
	assert.deepEqual(localRoots(f.hero), []);
	assert.deepEqual(localRoots(f.checkout), []);
});

test("a land of turns already on the dive ref deletes the dive's refs under every token and its markers, leaving each section once", async () => {
	const f = await setup("land-after-turns");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const ref = f.diveRef(f.id);
	f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	pushTheirs(f, f.remote, theirRef(f.id), "data");
	pushTheirs(f, origin, theirRef(f.id), "hero");
	assert.notEqual(git(origin, "rev-parse", ref), "");

	await land({}, f.plain);

	const doc = git(origin, "show", `refs/heads/main:kb/${f.id}.md`);
	assert.equal(heading(doc, "First"), 1);
	assert.equal(heading(doc, "Second"), 1);
	assert.equal(git(origin, "for-each-ref", "refs/nosedive"), "", "the dive's refs and the markers are gone");
	assert.equal(git(f.remote, "for-each-ref", "refs/nosedive"), "");
	assert.deepEqual(localRoots(f.hero), []);
	assert.deepEqual(localRoots(f.checkout), []);
});

test("a land after a rebase that followed a turn's push is not refused for the ref the turn left", async () => {
	const f = await setup("land-rebase");
	const ref = f.diveRef(f.id);
	const first = f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(f.remoteRef(ref), first);
	git(f.checkout, "commit", "-q", "--amend", "-m", "an idea, reworded");

	await land({}, f.plain);

	assert.equal(f.remoteRef(ref), "", "the dive's ref is gone");
	assert.notEqual(f.remoteRef("refs/heads/work/ideas"), "", "the work landed");
});

test("a land interrupted after its markers are pushed is finished by a rerun with no local state, from the markers on origin", async () => {
	const f = await setup("land-markers");
	const origin = git(f.hero, "remote", "get-url", "origin");
	f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	// A ref of the older shape the land cannot delete, so it stops after the record is pushed.
	const old = `refs/nosedive/${f.heroId}/dives/${f.id}`;
	git(origin, "update-ref", old, git(f.hero, "rev-parse", "HEAD"));
	const hook = join(origin, "hooks", "pre-receive");
	writeFileSync(hook, `#!/bin/sh\nwhile read old new ref; do\n  if [ "$new" = "${"0".repeat(40)}" ] && [ "$ref" = "${old}" ]; then\n    echo "injected deletion failure" >&2\n    exit 1\n  fi\ndone\nexit 0\n`, { mode: 0o755 });

	await assert.rejects(land({}, f.plain), /injected deletion failure/);
	const markers = git(origin, "for-each-ref", "--format=%(refname)", "refs/nosedive").split("\n").filter((ref) => /\/land\./.test(ref));
	assert.equal(markers.length, 2, "the record's and the dive tip's markers are on origin");
	assert.match(git(f.remote, "for-each-ref", "--format=%(refname)", "refs/nosedive"), /\/land\.[0-9a-f-]{36}\.[0-9a-f-]{36}\.tip/, "and the scope's, in the scope's origin");
	assert.deepEqual(localRoots(f.hero), []);
	assert.deepEqual(localRoots(f.checkout), []);
	// Nothing local remembers the run: every mirror of origin's refs is gone.
	for (const dir of [f.hero, f.checkout]) {
		for (const ref of git(dir, "for-each-ref", "--format=%(refname)", "refs/nosedive").split("\n").filter(Boolean)) git(dir, "update-ref", "-d", ref);
	}
	unlinkSync(hook);

	await land({}, f.plain);

	const doc = git(origin, "show", `refs/heads/main:kb/${f.id}.md`);
	assert.equal(heading(doc, "First"), 1);
	assert.equal(heading(doc, "landed"), 1, "no second record");
	assert.equal(git(origin, "for-each-ref", "refs/nosedive"), "", "the cleanup finished, the markers with it");
	assert.equal(git(f.remote, "for-each-ref", "refs/nosedive"), "");
	assert.equal(git(f.remote, "rev-list", "--count", "refs/heads/main..refs/heads/work/ideas"), "1", "the work was not stamped twice");
	assert.throws(() => f.onDeck(), "the dive is over");
});

test("jump and land take the work of the token that holds the dive over another token's newer ref", async () => {
	const f = await setup("holder-ref");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const code = f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	await pack({}, f.plain);
	// Another token's ref, newer than the pack's, with other work in it.
	const theirs = pushTheirs(f, f.remote, theirRef(f.id), "data");
	assert.notEqual(theirs, code);

	await jump({ ref: f.id }, f.plain);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), code, "the dive's work is its holder's, not the newer ref's");
	assert.equal(f.remoteRef(theirRef(f.id)), theirs, "and the other ref is left as it was");

	await land({}, f.plain);
	assert.equal(git(origin, "for-each-ref", "refs/nosedive"), "");
	assert.equal(f.remoteRef(theirRef(f.id)), "", "a land deletes the dive's refs under every token");
	assert.equal(git(f.remote, "rev-parse", "refs/heads/work/ideas^"), git(f.remote, "rev-parse", "refs/heads/main"), "and lands the holder's work");
	assert.notEqual(git(f.remote, "show", "refs/heads/work/ideas:idea.md"), "");
});

test("a dive packed under the name from before the ref scheme jumps and lands", async () => {
	const f = await setup("old-name");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const ref = f.diveRef(f.id);
	const old = `refs/nosedive/${f.heroId}/dives/${f.id}`;
	const code = f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	await pack({}, f.plain);
	git(f.remote, "update-ref", old, code);
	git(f.remote, "update-ref", "-d", ref);
	git(origin, "update-ref", old, git(origin, "rev-parse", ref));
	git(origin, "update-ref", "-d", ref);

	await jump({ ref: f.id }, f.plain);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), code, "the work comes back from the old name");
	await land({}, f.plain);

	assert.equal(git(origin, "for-each-ref", "refs/nosedive"), "", "the old ref goes with the dive");
	assert.equal(f.remoteRef(old), "");
	assert.notEqual(f.remoteRef("refs/heads/work/ideas"), "", "the work landed");
	assert.throws(() => f.onDeck(), "the dive is over");
});

test("a jump from another checkout picks the dive up from the refs of the token that packed it, and its turns go under its own token", async () => {
	const f = await setup("pickup");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const ref = f.diveRef(f.id);
	const code = f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	await pack({}, f.plain);
	const packed = git(origin, "rev-parse", ref);
	assert.equal(f.remoteRef(ref), code);

	// A clone, not a worktree: it shares no refs, so jump finds the dive through what it fetches.
	const other = join(f.hero, "..", "other-clone");
	git(f.hero, "clone", "-q", origin, other);
	git(other, "config", "user.name", "Work Test");
	git(other, "config", "user.email", "diver@example.com");
	appendFileSync(join(other, ".git", "info", "exclude"), "workspace/\n");
	const there = { ...f.ctx, cwd: other };
	await jump({ ref: f.id }, { ...there, capes: f.plain.capes });
	const theirs = join(other, "workspace", "data");
	assert.equal(git(theirs, "rev-parse", "HEAD"), code, "the scope's committed work is picked up");
	assert.equal(heading(readFileSync(join(other, "kb", `${f.id}.md`), "utf8"), "First"), 1, "the turn came with the pack's record, once");
	assert.deepEqual(localRoots(other), []);

	writeFileSync(join(theirs, "more.md"), "more\n");
	git(theirs, "add", "-A");
	git(theirs, "commit", "-q", "-m", "add more.md");
	f.err.length = 0;
	assert.equal(await launch(["pass", "--turn", f.id, "Two.", "--label", "Second"], there), 0, f.err.join("\n"));
	assert.equal(f.err.join(""), "");
	const mine = f.diveRef(f.id, other);
	assert.notEqual(mine, ref, "another checkout holds it under another token");
	assert.equal(f.remoteRef(mine), git(theirs, "rev-parse", "HEAD"));
	assert.equal(git(origin, "rev-parse", mine), git(other, "rev-parse", "HEAD"));
	assert.equal(git(origin, "rev-parse", ref), packed, "the first checkout's ref is as the pack left it");
});

test("a turn deletes the dive ref of a scope its holder reset to its base, and a deletion origin refuses keeps the hero unpushed", async () => {
	const f = await setup("scope-reset");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const ref = f.diveRef(f.id);
	const committed = f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(f.remoteRef(ref), committed);
	git(f.checkout, "reset", "-q", "--hard", "origin/main");
	const hook = join(f.remote, "hooks", "pre-receive");
	writeFileSync(hook, "#!/bin/sh\necho scope protected >&2\nexit 1\n", { mode: 0o755 });

	f.err.length = 0;
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	assert.match(f.err.join("\n"), /warning: data was not pushed to its dive ref \(.*scope protected.*\)/);
	assert.match(f.err.join("\n"), /warning: hero was not pushed to its dive ref/);
	assert.equal(f.remoteRef(ref), committed, "the refused deletion leaves it");
	assert.notEqual(git(origin, "rev-parse", ref), git(f.hero, "rev-parse", "HEAD"), "and the hero is not pushed past it");

	unlinkSync(hook);
	f.err.length = 0;
	assert.equal(await f.run(["Three.", "--label", "Third"]), 0, f.err.join("\n"));
	assert.equal(f.err.join(""), "");
	assert.equal(f.remoteRef(ref), "", "the work the holder reset away is no longer advertised");
	assert.equal(git(origin, "rev-parse", ref), git(f.hero, "rev-parse", "HEAD"));
});

test("a turn keeps the only remote backup when origin's work branch was force-rewound behind a stale tracking ref", async () => {
	const f = await setup("scope-rewound");
	const ref = f.diveRef(f.id);
	const committed = f.commit("idea.md", "an idea\n");
	git(f.checkout, "push", "-q", "origin", "HEAD:refs/heads/work/ideas");
	assert.equal(git(f.checkout, "rev-parse", "refs/remotes/origin/work/ideas"), committed, "the tracking ref saw the old work-branch tip");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(f.remoteRef(ref), committed);
	git(f.remote, "update-ref", "refs/heads/work/ideas", "refs/heads/main");
	assert.equal(git(f.checkout, "rev-parse", "refs/remotes/origin/work/ideas"), committed, "the checkout's tracking ref is stale");

	f.err.length = 0;
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	assert.equal(f.remoteRef(ref), committed, "the dive ref remains the only origin ref that holds the scope commit");
});

test("a rebased dive branch lands its turns once, counted, with no turn replayed as hero work", async () => {
	const f = await setup("rebased-turns");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const base = git(f.hero, "rev-parse", "main");
	writeFileSync(join(f.hero, "a.txt"), "a");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-qm", "hero a");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	// A rebase makes the person the committer of every commit it remakes, the turns' included.
	git(f.hero, "rebase", "-q", "--force-rebase", "main");
	assert.equal(git(f.hero, "log", "-1", "--format=%cn"), "Work Test");

	await land({}, f.plain);

	const doc = git(origin, "show", `refs/heads/main:kb/${f.id}.md`);
	assert.equal(heading(doc, "First"), 1);
	assert.equal(heading(doc, "Second"), 1);
	assert.match(doc, /\n- turns: 2$/);
	assert.equal(git(origin, "log", "--format=%s", `${base}..refs/heads/main`), `land(${git(f.hero, "show", `main:kb/${f.id}.md`).match(/^name: (.*)$/m)![1]}): diver@example.com landed it\nhero a`, "the hero's work and the record: no turn is replayed");
});

test("jump --sure from another checkout takes over a dive whose land stopped, and that checkout's land finishes it from the markers", async () => {
	const f = await setup("takeover");
	const origin = git(f.hero, "remote", "get-url", "origin");
	f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	// The home refuses the land's record, so it stops after the scope's work branch and the markers are pushed.
	const armed = join(f.hero, "..", "armed");
	writeFileSync(armed, "");
	const hook = join(origin, "hooks", "pre-receive");
	writeFileSync(hook, `#!/bin/sh\nwhile read old new ref; do\n  if [ "$ref" = "refs/heads/main" ] && [ -e "${armed.replace(/\\/g, "/")}" ]; then\n    echo "home refused" >&2\n    exit 1\n  fi\ndone\nexit 0\n`, { mode: 0o755 });
	await assert.rejects(land({}, f.plain), /home refused/);
	assert.notEqual(f.remoteRef("refs/heads/work/ideas"), "", "the scope's work is published");
	assert.match(git(f.remote, "for-each-ref", "--format=%(refname)", "refs/nosedive"), /\/land\.[0-9a-f-]{36}\.[0-9a-f-]{36}\.tip/, "with its markers");
	unlinkSync(armed);

	// A second checkout of the hero, a clone with its own token.
	const other = join(f.hero, "..", "other-clone");
	git(f.hero, "clone", "-q", origin, other);
	git(other, "config", "user.name", "Work Test");
	git(other, "config", "user.email", "diver@example.com");
	appendFileSync(join(other, ".git", "info", "exclude"), "workspace/\n");
	const there = { ...f.plain, cwd: other };
	await assert.rejects(jump({ ref: f.id }, there), /is held by diver@example\.com in another checkout of the hero: pack it there \(held-by-checkout\)/, "not without --sure");
	await jump({ ref: f.id, sure: true }, there);
	assert.match(readFileSync(join(other, "kb", `${f.id}.md`), "utf8"), /diver: diver@example\.com#[0-9a-f]{12}/);
	assert.equal(heading(readFileSync(join(other, "kb", `${f.id}.md`), "utf8"), "First"), 1, "the turn's section came with the takeover, once");

	await land({}, there);

	const doc = git(origin, "show", `refs/heads/main:kb/${f.id}.md`);
	assert.equal(heading(doc, "First"), 1);
	assert.equal(heading(doc, "landed"), 1);
	assert.match(doc, /\n- turns: 1$/);
	assert.equal(git(origin, "for-each-ref", "refs/nosedive"), "", "the dive's refs and the first checkout's markers are gone");
	assert.equal(git(f.remote, "for-each-ref", "refs/nosedive"), "");
	assert.equal(git(f.remote, "rev-list", "--count", "refs/heads/main..refs/heads/work/ideas"), "1", "the work was not stamped twice");
	assert.equal(git(other, "symbolic-ref", "--short", "HEAD"), "main");
});

test("a takeover land keeps and names a live former holder's later dive ref", async () => {
	const f = await setup("takeover-live-holder");
	const origin = git(f.hero, "remote", "get-url", "origin");
	f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	const armed = join(f.hero, "..", "armed");
	writeFileSync(armed, "");
	const hook = join(origin, "hooks", "pre-receive");
	writeFileSync(hook, `#!/bin/sh\nwhile read old new ref; do\n  if [ "$ref" = "refs/heads/main" ] && [ -e "${armed.replace(/\\/g, "/")}" ]; then\n    echo "home refused" >&2\n    exit 1\n  fi\ndone\nexit 0\n`, { mode: 0o755 });
	await assert.rejects(land({}, f.plain), /home refused/);

	const other = join(f.hero, "..", "other-clone");
	git(f.hero, "clone", "-q", origin, other);
	git(other, "config", "user.name", "Work Test");
	git(other, "config", "user.email", "diver@example.com");
	appendFileSync(join(other, ".git", "info", "exclude"), "workspace/\n");
	const there = { ...f.plain, cwd: other };
	await jump({ ref: f.id, sure: true }, there);

	assert.equal(await f.run(["Late.", "--label", "Late"]), 0, f.err.join("\n"));
	const formerRef = f.diveRef(f.id);
	const late = git(origin, "rev-parse", formerRef);
	unlinkSync(armed);
	f.out.length = 0;
	await land({}, there);

	assert.equal(git(origin, "rev-parse", formerRef), late, "the former holder's later turn remains backed up");
	assert.match(f.out.join("\n"), new RegExp(formerRef.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "land names the ref it kept");
});

test("two failed land attempts keep each token's markers together, then a takeover cleans every marker", async () => {
	const f = await setup("takeover-marker-attempts");
	const origin = git(f.hero, "remote", "get-url", "origin");
	f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	const armed = join(f.hero, "..", "armed");
	writeFileSync(armed, "");
	const hook = join(origin, "hooks", "pre-receive");
	writeFileSync(hook, `#!/bin/sh\nwhile read old new ref; do\n  if [ "$ref" = "refs/heads/main" ] && [ -e "${armed.replace(/\\/g, "/")}" ]; then\n    echo "home refused" >&2\n    exit 1\n  fi\ndone\nexit 0\n`, { mode: 0o755 });
	await assert.rejects(land({}, f.plain), /home refused/, "the first token leaves a complete attempt");

	const other = join(f.hero, "..", "other-clone");
	git(f.hero, "clone", "-q", origin, other);
	git(other, "config", "user.name", "Work Test");
	git(other, "config", "user.email", "diver@example.com");
	appendFileSync(join(other, ".git", "info", "exclude"), "workspace/\n");
	const there = { ...f.plain, cwd: other };
	await jump({ ref: f.id, sure: true }, there);
	await assert.rejects(land({}, there), /home refused/, "the second token leaves its own record marker");
	const attempts = new Set(git(origin, "for-each-ref", "--format=%(refname)", "refs/nosedive").split("\n").filter((ref) => ref.includes(`/land.${f.id}.`)).map((ref) => ref.split("/")[2]));
	assert.equal(attempts.size, 2, "both attempts are present before recovery");

	unlinkSync(armed);
	await land({}, there);
	assert.equal(git(origin, "for-each-ref", "--format=%(refname)", "refs/nosedive").split("\n").filter((ref) => ref.includes(`/land.${f.id}.`)).join(""), "", "every hero marker is cleaned");
	assert.equal(git(f.remote, "for-each-ref", "--format=%(refname)", "refs/nosedive").split("\n").filter((ref) => ref.includes(`/land.${f.id}.`)).join(""), "", "every scope marker is cleaned");
	assert.equal(heading(git(origin, "show", `refs/heads/main:kb/${f.id}.md`), "landed"), 1);
});

test("takeover preserves a real appended turn but replays same-subject hero work that edits existing dive text", async () => {
	const f = await setup("takeover-turn-shape");
	const origin = git(f.hero, "remote", "get-url", "origin");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	const path = join(f.hero, "kb", `${f.id}.md`);
	const name = /^name: (.*)$/m.exec(readFileSync(path, "utf8"))![1]!;
	writeFileSync(path, readFileSync(path, "utf8").replace("# Do the next part", "# Edited ordinary hero work"));
	git(f.hero, "add", path);
	git(f.hero, "commit", "-q", "-m", `feat(${name}): pass turn`);
	const marker = f.diveRef(f.id).replace(`/dive.${f.id}`, `/land.${f.id}.record`);
	git(f.hero, "push", "-q", "origin", `HEAD:${marker}`);

	const other = join(f.hero, "..", "other-clone");
	git(f.hero, "clone", "-q", origin, other);
	git(other, "config", "user.name", "Work Test");
	git(other, "config", "user.email", "diver@example.com");
	appendFileSync(join(other, ".git", "info", "exclude"), "workspace/\n");
	await jump({ ref: f.id, sure: true }, { ...f.plain, cwd: other });

	const taken = readFileSync(join(other, "kb", `${f.id}.md`), "utf8");
	assert.equal(heading(taken, "First"), 1, "the append-only turn remains a turn and is carried once");
	assert.match(taken, /# Edited ordinary hero work/, "the same-subject edit is ordinary hero work and is replayed");
});

test("the loop's code names no ref outside refs/nosedive/", () => {
	for (const file of ["i01a15bb27be9786f91885a2f0a0fa08e", "if8cb5f3d6de95b8ea88d25f745af7b03", "i0735c57383365d4ca5395ea24f5b0649", "iffc777778a63553ba90babcc038eb748", "i2bcf8d7ee2645df5b261ee1b2135d190", "i01a18f6b14f97ca38a091f6b31317223"]) {
		const text = readFileSync(new URL(`./${file}.ts`, import.meta.url), "utf8");
		assert.doesNotMatch(text, /refs\/nosedive-/, file);
	}
});

test("a core that gives gates no committed hook still says the turn is on the dive branch, not pushed", async () => {
	const f = await setup("old-core");
	const cape = f.ctx.capes[1]!;
	const key = namespacedUuid(TURN, cape.id);
	const real = cape.index[key] as typeof turn;
	cape.index[key] = ((call: Parameters<typeof turn>[0]) => real({ ...call, gate: { ...call.gate!, committed: undefined } })) as never;
	const base = git(f.hero, "rev-parse", "main");
	const origin = git(f.hero, "remote", "get-url", "origin");
	assert.equal(await f.run(["Old.", "--label", "First"]), 0, f.err.join("\n"));
	assert.match(f.out.join("\n"), /turn: committed on the dive branch, not pushed: this core gives gates no commit hook; pack or land pushes it/);
	assert.equal(f.err.join(""), "");
	assert.equal(git(f.hero, "rev-parse", "main"), base);
	assert.equal(git(origin, "for-each-ref", "refs/nosedive"), "", "nothing was pushed");
	assert.equal(heading(git(f.hero, "show", `HEAD:kb/${f.id}.md`), "First"), 1);
});

test("help for pass --turn, jump, pack, land and bail says where turns live, and that uncommitted changes are not backed up", () => {
	for (const doc of ["01a18f45-42c6-70cc-b111-f6bd564e1f50", "01a15bb2-736b-7eac-84a7-3389e72d9590", "01a15bb2-7501-731a-9e9c-1e41b96c3dde", "01a15bb2-786d-7958-9f53-bf95a2f06ff0", "01a15bb2-76d1-7aa2-b4e5-dcc260c69c00"]) {
		const body = readFileSync(new URL(`../kb/${doc}.md`, import.meta.url), "utf8");
		const usage = /(?:^|\n)## Usage\n([\s\S]*?)(?=\n## |$)/.exec(body)![1]!;
		assert.match(usage, /Turns live on the dive branch and its dive ref, and reach the home only when land, pack or bail puts the dive down/, doc);
		assert.match(usage, /uncommitted changes are not backed up/i, doc);
	}
});

test("two turns then a land: the one record it pushes holds each section once, counts the turns, and no turn is its own commit on the home", async () => {
	const f = await setup("land");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const base = git(f.hero, "rev-parse", "main");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	assert.equal(git(origin, "rev-parse", "refs/heads/main"), base, "neither turn is on the home before the land");
	await land({}, f.plain);
	const doc = f.doc(f.id);
	assert.equal(heading(doc, "First"), 1);
	assert.equal(heading(doc, "Second"), 1);
	assert.ok(doc.indexOf("One.") < doc.indexOf("Two.") && doc.indexOf("Two.") < doc.indexOf("landed it."));
	assert.match(doc, /\n- turns: 2\n$/);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "main");
	const commits = git(f.hero, "rev-list", `${base}..main`).split("\n");
	assert.equal(commits.length, 1, "the land record alone");
	assert.notEqual(git(f.hero, "diff-tree", "--no-commit-id", "--name-only", "-r", commits[0]!), "", "and it changes the dive doc");
	assert.equal(git(origin, "rev-parse", "refs/heads/main"), git(f.hero, "rev-parse", "main"));
	assert.equal(git(f.hero, "branch", "--list", "nosedive-*"), "");
});

test("crud refuses to edit or drop a held dive's doc, and edits it once packed", async () => {
	const f = await setup("held");
	const before = f.doc(f.id);
	const head = git(f.hero, "rev-parse", "HEAD");
	assert.equal(await launch(["crud", f.id, "--gist", "A better gist"], f.ctx), 1);
	assert.match(f.err.join("\n"), /dive [0-9a-f]{6}\.ideas is held by diver@example\.com, so its doc changes only through the loop: record a turn with `pass --turn` instead, or pack it first/);
	f.err.length = 0;
	assert.equal(await launch(["crud", "--drop", f.id], f.ctx), 1);
	assert.match(f.err.join("\n"), /dive [0-9a-f]{6}\.ideas is held by diver@example\.com: it is not over/);
	assert.equal(f.doc(f.id), before);
	assert.equal(git(f.hero, "rev-parse", "HEAD"), head);

	await pack({}, f.plain);
	f.err.length = 0;
	assert.equal(await launch(["crud", f.id, "--gist", "A better gist"], f.ctx), 0, f.err.join("\n"));
	assert.match(f.doc(f.id), /\ngist: "?A better gist"?\n/);
});
