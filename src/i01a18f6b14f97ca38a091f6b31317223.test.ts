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


// A turn is committed on the dive branch and pushed to the dive's ref, never to the home; land, pack and bail publish it in their record (turns-publish-when, turns-pushed-where)

const heading = (text: string, label: string) => (text.match(new RegExp(`^## \\S+ ${label}$`, "gm")) ?? []).length;
const diveRefOf = (heroId: string, id: string) => `refs/nosedive/${heroId}/dives/${id}`;
const leaseOf = (id: string) => `refs/nosedive-lease/${id}`;
const refIn = (dir: string, ref: string) => spawnSync("git", ["rev-parse", "--verify", "-q", ref], { cwd: dir, encoding: "utf8" }).stdout.trim();
const leaseIn = (dir: string, id: string) => refIn(dir, leaseOf(id));

test("a turn is committed on the dive branch and pushed to the dive's ref, not to the home, says so, and leaves the hero's work in progress alone", async () => {
	const f = await setup("home");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const root = join(f.hero, "kb", `${f.heroId}.md`);
	writeFileSync(root, `${readFileSync(root, "utf8")}\nedited, not staged\n`);
	writeFileSync(join(f.hero, "kb", "draft.md"), "half a thought\n");
	const status = git(f.hero, "status", "--porcelain");
	const base = git(f.hero, "rev-parse", "main");
	const ref = diveRefOf(f.heroId, f.id);
	assert.equal(leaseIn(f.hero, f.id), "", "a dive nobody pushed has nothing leased");

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
	assert.equal(leaseIn(f.hero, f.id), turn, "the sha this dive left on its ref is kept locally");
	assert.equal(git(origin, "for-each-ref", "refs/nosedive-lease"), "", "never pushed");
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
	const ref = diveRefOf(f.heroId, f.id);
	const hook = join(origin, "hooks", "pre-receive");
	writeFileSync(hook, "#!/bin/sh\necho protected >&2\nexit 1\n", { mode: 0o755 });
	assert.equal(await f.run(["Refused.", "--label", "First"]), 0, f.err.join("\n"));
	assert.match(f.err.join("\n"), /warning: hero was not pushed to its dive ref \(.*protected.*\); its committed work stays on the dive branch, and a later turn, pack or land pushes it/);
	assert.equal(refIn(origin, ref), "", "nothing was pushed");
	assert.equal(leaseIn(f.hero, f.id), "", "so nothing is leased");

	unlinkSync(hook);
	const here = git(f.hero, "remote", "get-url", "origin");
	git(f.hero, "remote", "set-url", "origin", join(f.hero, "..", "missing.git"));
	f.err.length = 0;
	assert.equal(await f.run(["Offline.", "--label", "Second"]), 0, f.err.join("\n"));
	assert.match(f.err.join("\n"), /warning: hero was not pushed to its dive ref/);
	assert.match(f.out.slice(-1)[0]!, /committed on the dive branch, not pushed;/);
	assert.equal(leaseIn(f.hero, f.id), "");

	git(f.hero, "remote", "set-url", "origin", here);
	f.err.length = 0;
	assert.equal(await f.run(["Online.", "--label", "Third"]), 0, f.err.join("\n"));
	assert.equal(f.err.join(""), "", "nothing to warn of");
	const tip = git(f.hero, "rev-parse", "HEAD");
	assert.equal(git(origin, "rev-parse", ref), tip, "the next turn pushed what the earlier ones left");
	assert.equal(git(origin, "rev-list", "--count", `${base}..${ref}`), "3");
	assert.equal(leaseIn(f.hero, f.id), tip);
	assert.equal(git(origin, "rev-parse", "refs/heads/main"), base);
});

test("a turn pushes each scope's committed work to its dive ref and warns of uncommitted changes, which it never commits", async () => {
	const f = await setup("scopes");
	const ref = diveRefOf(f.heroId, f.id);
	const committed = f.commit("idea.md", "an idea\n");
	writeFileSync(join(f.checkout, "draft.md"), "unfinished\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(f.remoteRef(ref), committed, "the scope's committed work is on its dive ref");
	assert.equal(leaseIn(f.checkout, f.id), committed);
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

test("a turn after a rebase overwrites the dive ref under its lease", async () => {
	const f = await setup("rebase-turn");
	const ref = diveRefOf(f.heroId, f.id);
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
	assert.equal(leaseIn(f.checkout, f.id), rewritten);
});

test("pack after a rebase that followed a turn's push succeeds, replacing the dive's ref it left there", async () => {
	const f = await setup("rebase-pack");
	const ref = diveRefOf(f.heroId, f.id);
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

test("a push leased against a stale sha, as from a second holder, is refused and overwrites nothing", async () => {
	const f = await setup("stale");
	const ref = diveRefOf(f.heroId, f.id);
	const first = f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(f.remoteRef(ref), first);
	// Another holder of the dive replaces the ref, as a takeover or a crashed agent's checkout coming back would.
	const other = join(f.hero, "..", "second-holder");
	git(f.hero, "clone", "-q", f.remote, other);
	git(other, "-c", "user.name=O", "-c", "user.email=o@example.com", "commit", "-q", "--allow-empty", "-m", "theirs");
	const theirs = git(other, "rev-parse", "HEAD");
	git(other, "push", "-q", "--force", "origin", `HEAD:${ref}`);

	const more = f.commit("more.md", "more\n");
	f.err.length = 0;
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	assert.match(f.err.join("\n"), /warning: data was not pushed to its dive ref/);
	assert.equal(f.remoteRef(ref), theirs, "the other holder's ref is as they left it");
	assert.equal(leaseIn(f.checkout, f.id), first, "the lease did not move");
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), more, "the work is still committed");
	assert.equal(heading(git(f.hero, "show", `HEAD:kb/${f.id}.md`), "Second"), 1, "and so is the turn");
	await assert.rejects(pack({}, f.plain), /the dive's refs moved under it, so nothing was put down:\n {2}data: refs\/nosedive\/[^ ]+ is at \w{7}, which this dive did not see/);
	assert.equal(f.remoteRef(ref), theirs, "pack overwrote nothing either");
});

test("a pack of turns already on the dive ref keeps one record and does not double them on its ref", async () => {
	const f = await setup("pack-after-turns");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const base = git(f.hero, "rev-parse", "main");
	const ref = diveRefOf(f.heroId, f.id);
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
	assert.equal(leaseIn(f.hero, f.id), tip, "the lease follows the ref the pack kept");
	assert.equal(leaseIn(f.checkout, f.id), code);
});

test("a land of turns already on the dive ref deletes it, leaves each section once, and drops the leases", async () => {
	const f = await setup("land-after-turns");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const ref = diveRefOf(f.heroId, f.id);
	f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	assert.notEqual(git(origin, "rev-parse", ref), "");
	assert.notEqual(f.remoteRef(ref), "");

	await land({}, f.plain);

	const doc = git(origin, "show", `refs/heads/main:kb/${f.id}.md`);
	assert.equal(heading(doc, "First"), 1);
	assert.equal(heading(doc, "Second"), 1);
	assert.equal(git(origin, "for-each-ref", "refs/nosedive"), "", "the dive's ref is gone");
	assert.equal(f.remoteRef(ref), "");
	assert.equal(leaseIn(f.hero, f.id), "", "the lease is dropped");
	assert.equal(leaseIn(f.checkout, f.id), "");
});

test("a land after a rebase that followed a turn's push is not refused for the ref the turn left", async () => {
	const f = await setup("land-rebase");
	const ref = diveRefOf(f.heroId, f.id);
	const first = f.commit("idea.md", "an idea\n");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(f.remoteRef(ref), first);
	git(f.checkout, "commit", "-q", "--amend", "-m", "an idea, reworded");

	await land({}, f.plain);

	assert.equal(f.remoteRef(ref), "", "the dive's ref is gone");
	assert.notEqual(f.remoteRef("refs/heads/work/ideas"), "", "the work landed");
});

test("a jump from another checkout starts its lease at the dive refs it picked up, and its turns push from there", async () => {
	const f = await setup("pickup");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const ref = diveRefOf(f.heroId, f.id);
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
	// As if this machine's checkouts were new to the dive: the first checkout's own lease is not what the jump finds.
	git(f.hero, "update-ref", "-d", leaseOf(f.id));
	git(f.checkout, "update-ref", "-d", leaseOf(f.id));
	assert.equal(leaseIn(f.checkout, f.id), "");
	assert.equal(leaseIn(other, f.id), "");
	await jump({ ref: f.id }, { ...there, capes: f.plain.capes });
	const theirs = join(other, "workspace", "data");
	assert.equal(leaseIn(other, f.id), packed, "the hero's lease is the ref it observed");
	assert.equal(leaseIn(theirs, f.id), code, "and the scope's");
	assert.equal(heading(readFileSync(join(other, "kb", `${f.id}.md`), "utf8"), "First"), 1, "the turn came with the pack's record, once");

	writeFileSync(join(theirs, "more.md"), "more\n");
	git(theirs, "add", "-A");
	git(theirs, "commit", "-q", "-m", "add more.md");
	f.err.length = 0;
	assert.equal(await launch(["pass", "--turn", f.id, "Two.", "--label", "Second"], there), 0, f.err.join("\n"));
	assert.equal(f.err.join(""), "", "the second checkout's turn is not refused by the first one's earlier push");
	assert.equal(f.remoteRef(ref), git(theirs, "rev-parse", "HEAD"));
	assert.equal(git(origin, "rev-parse", ref), git(other, "rev-parse", "HEAD"));
	assert.equal(leaseIn(other, f.id), git(other, "rev-parse", "HEAD"));
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
