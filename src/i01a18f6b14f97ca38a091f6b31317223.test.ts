import assert from "node:assert/strict";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
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

// A turn reaches the dive's home (turns-on-jumped-branch)

/** Commits `file` with `text` on the origin's main from a second clone, as another checkout's push would. */
function pushElsewhere(f: Awaited<ReturnType<typeof setup>>, file: string, text: string): string {
	const origin = git(f.hero, "remote", "get-url", "origin");
	const other = join(f.hero, "..", `other-${file}`);
	git(f.hero, "clone", "-q", origin, other);
	writeFileSync(join(other, file), text);
	git(other, "add", "-A");
	git(other, "-c", "user.name=O", "-c", "user.email=o@example.com", "commit", "-q", "-m", `add ${file}`);
	git(other, "push", "-q", "origin", "HEAD:main");
	return git(other, "rev-parse", "HEAD");
}

const heading = (text: string, label: string) => (text.match(new RegExp(`^## \\S+ ${label}$`, "gm")) ?? []).length;

test("a turn is committed on the home and pushed, and on the dive branch, and leaves the hero's work in progress alone", async () => {
	const f = await setup("home");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const root = join(f.hero, "kb", `${f.heroId}.md`);
	writeFileSync(root, `${readFileSync(root, "utf8")}\nedited, not staged\n`);
	writeFileSync(join(f.hero, "kb", "draft.md"), "half a thought\n");
	const status = git(f.hero, "status", "--porcelain");
	const base = git(f.hero, "rev-parse", "main");

	assert.equal(await f.run(["Implemented the gate.", "--label", "First"]), 0, f.err.join("\n"));
	assert.match(f.out.join("\n"), /turn: [0-9a-f]{7} on main, pushed to origin\/main/);
	assert.equal(f.err.join(""), "");
	const turn = git(f.hero, "rev-parse", "HEAD");
	assert.match(git(f.hero, "symbolic-ref", "--short", "HEAD"), /^nosedive-/, "the hero stays on the dive branch");
	assert.equal(git(f.hero, "rev-list", "--count", `${base}..main`), "1", "one commit on the home");
	assert.equal(git(origin, "rev-parse", "refs/heads/main"), git(f.hero, "rev-parse", "main"), "pushed");
	assert.equal(git(f.hero, "rev-parse", "refs/remotes/origin/main"), git(f.hero, "rev-parse", "main"));
	assert.equal(git(f.hero, "show", `main:kb/${f.id}.md`), git(f.hero, "show", `${turn}:kb/${f.id}.md`), "the dive's doc alike on both");
	assert.equal(heading(git(f.hero, "show", `main:kb/${f.id}.md`), "First"), 1);
	assert.equal(git(f.hero, "diff-tree", "--no-commit-id", "--name-only", "-r", "main"), `kb/${f.id}.md`, "only the turn's change goes home");
	const show = (rev: string) => git(f.hero, "log", "-1", "--format=%B|%an %ae %aI %cn %ce %cI", rev);
	assert.equal(show("main"), show(turn), "its message, author and dates");
	assert.equal(git(f.hero, "status", "--porcelain"), status, "the working tree's other changes are as they were");
	assert.match(readFileSync(root, "utf8"), /edited, not staged\n$/);
	assert.equal(git(f.hero, "rev-list", "--count", `${base}..${turn}`), "1", "the dive branch holds it too");
});

test("a turn while the upstream has moved goes on top of it", async () => {
	const f = await setup("moved");
	const theirs = pushElsewhere(f, "elsewhere.md", "someone else's work\n");
	assert.equal(await f.run(["Mine.", "--label", "Mine"]), 0, f.err.join("\n"));
	const origin = git(f.hero, "remote", "get-url", "origin");
	assert.equal(f.err.join(""), "");
	assert.equal(git(origin, "rev-parse", "refs/heads/main^"), theirs, "on top of the other push");
	assert.equal(git(f.hero, "rev-parse", "main"), git(origin, "rev-parse", "refs/heads/main"), "the home followed");
	assert.equal(git(f.hero, "show", "main:elsewhere.md"), "someone else's work");
	assert.equal(heading(git(f.hero, "show", `main:kb/${f.id}.md`), "Mine"), 1);
	assert.equal(git(f.hero, "rev-list", "--count", "refs/remotes/origin/main..main"), "0");
	assert.match(f.out.join("\n"), /pushed to origin\/main/);
});

test("a turn while the upstream has moved takes the turns an offline one kept on top of it too", async () => {
	const f = await setup("moved-kept");
	const origin = git(f.hero, "remote", "get-url", "origin");
	git(f.hero, "remote", "set-url", "origin", join(f.hero, "..", "missing.git"));
	assert.equal(await f.run(["Offline.", "--label", "Offline"]), 0, f.err.join("\n"));
	git(f.hero, "remote", "set-url", "origin", origin);
	const theirs = pushElsewhere(f, "elsewhere.md", "someone else's work\n");
	assert.equal(await f.run(["Online.", "--label", "Online"]), 0, f.err.join("\n"));
	assert.equal(git(origin, "rev-list", "--count", `${theirs}..refs/heads/main`), "2", "both turns on top of theirs");
	assert.equal(git(f.hero, "rev-parse", "main"), git(origin, "rev-parse", "refs/heads/main"));
	const doc = git(f.hero, "show", `main:kb/${f.id}.md`);
	assert.equal(heading(doc, "Offline") + heading(doc, "Online"), 2);
});

test("a turn with the upstream unreachable is kept on both branches, warned, and pushed by the next turn", async () => {
	const f = await setup("offline");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const base = git(f.hero, "rev-parse", "main");
	git(f.hero, "remote", "set-url", "origin", join(f.hero, "..", "missing.git"));
	assert.equal(await f.run(["Offline.", "--label", "First"]), 0, f.err.join("\n"));
	assert.match(f.err.join("\n"), /warning: the turn is on main but not pushed to origin\/main: .+; the next turn, pack or land pushes it/);
	assert.equal(git(f.hero, "rev-list", "--count", `${base}..main`), "1", "kept on the home");
	assert.equal(git(f.hero, "rev-list", "--count", "refs/remotes/origin/main..main"), "1", "ahead of its upstream");
	assert.equal(heading(git(f.hero, "show", `HEAD:kb/${f.id}.md`), "First"), 1, "and on the dive branch");

	git(f.hero, "remote", "set-url", "origin", origin);
	f.err.length = 0;
	assert.equal(await f.run(["Online.", "--label", "Second"]), 0, f.err.join("\n"));
	assert.equal(f.err.join(""), "");
	assert.equal(git(origin, "rev-list", "--count", `${base}..refs/heads/main`), "2", "both pushed");
	assert.equal(git(f.hero, "rev-list", "--count", "refs/remotes/origin/main..main"), "0");
	const doc = git(origin, "show", `refs/heads/main:kb/${f.id}.md`);
	assert.equal(heading(doc, "First") + heading(doc, "Second"), 2);
});

test("a turn the upstream refuses, as a protected trunk does, is kept and warned, and pack pushes it", async () => {
	const f = await setup("refused");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const base = git(f.hero, "rev-parse", "main");
	const hook = join(origin, "hooks", "pre-receive");
	writeFileSync(hook, "#!/bin/sh\necho protected >&2\nexit 1\n", { mode: 0o755 });
	assert.equal(await f.run(["Refused.", "--label", "First"]), 0, f.err.join("\n"));
	assert.match(f.err.join("\n"), /warning: the turn is on main but not pushed to origin\/main: .*protected.*; the next turn, pack or land pushes it/);
	assert.equal(git(origin, "rev-parse", "refs/heads/main"), base, "nothing reached the upstream");
	assert.equal(git(f.hero, "rev-list", "--count", `${base}..main`), "1");

	unlinkSync(hook);
	await pack({}, f.plain);
	assert.equal(git(f.hero, "rev-list", "--count", "refs/remotes/origin/main..main"), "0", "pack pushed the home");
	assert.equal(heading(git(origin, "show", `refs/heads/main:kb/${f.id}.md`), "First"), 1);
});

test("a turn whose merge conflicts with the home leaves the home as it was, stays on the dive branch, and says so", async () => {
	const f = await setup("conflict");
	const origin = git(f.hero, "remote", "get-url", "origin");
	// The home's copy of the dive doc is changed by hand at its end, where a turn appends.
	const tree = join(f.hero, "..", "home-tree");
	git(f.hero, "worktree", "add", "-q", tree, "main");
	const path = join(tree, "kb", `${f.id}.md`);
	writeFileSync(path, `${readFileSync(path, "utf8").trimEnd()} Changed by hand.\n`);
	// By nosedive's hand, so it is the conflict that refuses the turn, not whose commit it is.
	git(tree, "-c", "user.name=nosedive", "-c", "user.email=noreply@nosedive.dev", "commit", "-qam", "by hand");
	git(f.hero, "worktree", "remove", "--force", tree);
	const home = git(f.hero, "rev-parse", "main");

	assert.equal(await f.run(["Conflicting.", "--label", "First"]), 0, f.err.join("\n"));
	assert.match(f.err.join("\n"), /warning: the turn is on the dive branch only: it conflicts with main: .+; land carries it/);
	assert.equal(git(f.hero, "rev-parse", "main"), home, "the home is as it was");
	assert.equal(git(origin, "rev-parse", "refs/heads/main"), git(f.hero, "rev-parse", "refs/remotes/origin/main"), "nothing pushed");
	assert.equal(heading(git(f.hero, "show", `HEAD:kb/${f.id}.md`), "First"), 1, "the dive branch holds it");
	assert.equal(git(f.hero, "status", "--porcelain"), "");
});

test("a core that gives gates no committed hook leaves the turn on the dive branch and says so", async () => {
	const f = await setup("old-core");
	const cape = f.ctx.capes[1]!;
	const key = namespacedUuid(TURN, cape.id);
	const real = cape.index[key] as typeof turn;
	cape.index[key] = ((call: Parameters<typeof turn>[0]) => real({ ...call, gate: { ...call.gate!, committed: undefined } })) as never;
	const base = git(f.hero, "rev-parse", "main");
	assert.equal(await f.run(["Old.", "--label", "First"]), 0, f.err.join("\n"));
	assert.match(f.err.join("\n"), /warning: this nosedive cannot put the turn on main, so it is on the dive branch only: update nosedive core/);
	assert.equal(git(f.hero, "rev-parse", "main"), base);
	assert.equal(heading(git(f.hero, "show", `HEAD:kb/${f.id}.md`), "First"), 1);
});

test("two turns then a land leave each section once on the home, and no empty commit", async () => {
	const f = await setup("land");
	const origin = git(f.hero, "remote", "get-url", "origin");
	const base = git(f.hero, "rev-parse", "main");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	const pushed = git(origin, "show", `refs/heads/main:kb/${f.id}.md`);
	assert.equal(heading(pushed, "First") + heading(pushed, "Second"), 2, "both on the home before the land");
	await land({}, f.plain);
	const doc = f.doc(f.id);
	assert.equal(heading(doc, "First"), 1);
	assert.equal(heading(doc, "Second"), 1);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "main");
	const commits = git(f.hero, "rev-list", `${base}..main`).split("\n");
	assert.equal(commits.length, 3, "the two turns and the land record");
	for (const commit of commits) assert.notEqual(git(f.hero, "diff-tree", "--no-commit-id", "--name-only", "-r", commit), "", `${commit} changes something`);
	assert.equal(git(origin, "rev-parse", "refs/heads/main"), git(f.hero, "rev-parse", "main"));
	assert.equal(git(f.hero, "branch", "--list", "nosedive-*"), "");
});

// The dive's turns are commits on its branch and again on the home; land replays only what the home lacks (land-skips-applied-turns).
for (const [label, around] of [
	["before the first turn", [true, false, false]],
	["between the turns", [false, true, false]],
	["after the turns", [false, false, true]],
	["before, between and after the turns", [true, true, true]],
] as const) {
	test(`two turns then a land with the person's commits ${label} leave each section once and each commit once`, async () => {
		const f = await setup(`land-around-${around.map(Number).join("")}`);
		const origin = git(f.hero, "remote", "get-url", "origin");
		const base = git(f.hero, "rev-parse", "main");
		const mine = (name: string) => {
			writeFileSync(join(f.hero, `${name}.txt`), name);
			git(f.hero, "add", "-A");
			git(f.hero, "commit", "-qm", `person ${name}`);
		};
		if (around[0]) mine("a");
		assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
		if (around[1]) mine("b");
		assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
		if (around[2]) mine("c");
		await land({}, f.plain);
		assert.equal(heading(f.doc(f.id), "First"), 1);
		assert.equal(heading(f.doc(f.id), "Second"), 1);
		const subjects = git(f.hero, "log", "--format=%s", `${base}..main`).split("\n");
		for (const [i, name] of ["a", "b", "c"].entries()) assert.equal(subjects.filter((s) => s === `person ${name}`).length, around[i] ? 1 : 0, `person ${name}`);
		for (const commit of git(f.hero, "rev-list", `${base}..main`).split("\n")) assert.notEqual(git(f.hero, "diff-tree", "--no-commit-id", "--name-only", "-r", commit), "", `${commit} changes something`);
		assert.equal(git(origin, "rev-parse", "refs/heads/main"), git(f.hero, "rev-parse", "main"));
		assert.equal(git(f.hero, "branch", "--list", "nosedive-*"), "");
	});
}

// What land says of the dive's commits the home already holds (land-skips-applied-turns): each one the replay skipped, by short SHA and subject.
const diveCommits = (hero: string, base: string, id: string) => git(hero, "log", "--reverse", "--format=%h %s", `${base}..HEAD`).split("\n").filter(Boolean).map((line) => ({ line, turn: git(hero, "diff-tree", "--no-commit-id", "--name-only", "-r", line.slice(0, 7)) === `kb/${id}.md` }));

// The replay skips a turn the home holds, whether it conflicts with the later turns after it or is a clean pick that changes nothing, so both turns are reported.
test("two turns then a land with the person's commit before the first turn say each turn is already on main", async () => {
	const f = await setup("land-says-before");
	const base = git(f.hero, "rev-parse", "main");
	writeFileSync(join(f.hero, "a.txt"), "a");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-qm", "person a");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	const turns = diveCommits(f.hero, base, f.id).filter((commit) => commit.turn);
	f.out.length = 0;
	await land({}, f.plain);
	assert.equal(f.out.join("\n"), [`landed ${f.id.slice(-6)}.ideas`, "- data: unchanged", "- hero: 1 commit onto main", ...turns.map((commit) => `- hero: already on main: ${commit.line}`)].join("\n"));
	assert.equal(heading(f.doc(f.id), "First"), 1);
	assert.equal(heading(f.doc(f.id), "Second"), 1);
});

test("two turns then a land with the person's commits before, between and after say each turn is already on main", async () => {
	const f = await setup("land-says-around");
	const base = git(f.hero, "rev-parse", "main");
	const mine = (name: string) => {
		writeFileSync(join(f.hero, `${name}.txt`), name);
		git(f.hero, "add", "-A");
		git(f.hero, "commit", "-qm", `person ${name}`);
	};
	mine("a");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	mine("b");
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	mine("c");
	const turns = diveCommits(f.hero, base, f.id).filter((commit) => commit.turn);
	f.out.length = 0;
	await land({}, f.plain);
	assert.equal(f.out.join("\n"), [`landed ${f.id.slice(-6)}.ideas`, "- data: unchanged", "- hero: 3 commits onto main", ...turns.map((commit) => `- hero: already on main: ${commit.line}`)].join("\n"));
	assert.equal(heading(f.doc(f.id), "First"), 1);
	assert.equal(heading(f.doc(f.id), "Second"), 1);
});

test("a land that makes no hero commit because the home holds them all still reports the commits it skipped", async () => {
	const f = await setup("land-says-all-held");
	const base = git(f.hero, "rev-parse", "main");
	writeFileSync(join(f.hero, "a.txt"), "a");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-qm", "person a");
	// The home gets the same change from elsewhere, as a different commit, so land has nothing of the person's to make.
	const tree = join(f.hero, "..", "home-tree");
	git(f.hero, "worktree", "add", "-q", tree, "main");
	writeFileSync(join(tree, "a.txt"), "a");
	git(tree, "add", "-A");
	git(tree, "-c", "user.name=Other", "-c", "user.email=other@example.com", "commit", "-qm", "person a on the home");
	git(tree, "push", "-q", "origin", "HEAD:main");
	git(f.hero, "worktree", "remove", "--force", tree);
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	const held = diveCommits(f.hero, base, f.id);
	const home = git(f.hero, "rev-list", "--count", "main");
	f.out.length = 0;
	await land({}, f.plain);
	assert.equal(f.out.join("\n"), [`landed ${f.id.slice(-6)}.ideas`, "- data: unchanged", ...held.map((commit) => `- hero: already on main: ${commit.line}`)].join("\n"));
	// The home gains only the land record.
	assert.equal(git(f.hero, "rev-list", "--count", "main"), String(Number(home) + 1));
	assert.equal(heading(f.doc(f.id), "First"), 1);
	assert.equal(heading(f.doc(f.id), "Second"), 1);
});

test("a land rerun does not list a skipped turn as landed now, but as already on main", async () => {
	const f = await setup("land-rerun-skips");
	const base = git(f.hero, "rev-parse", "main");
	writeFileSync(join(f.hero, "a.txt"), "a");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-qm", "person a");
	assert.equal(await f.run(["One.", "--label", "First"]), 0, f.err.join("\n"));
	assert.equal(await f.run(["Two.", "--label", "Second"]), 0, f.err.join("\n"));
	const heroRemote = git(f.hero, "remote", "get-url", "origin");
	const guard = join(f.hero, "..", "open").replace(/\\/g, "/");
	// The home refuses the land's own commit until the guard file exists, so the failed run publishes none of the hero's work; turns are not refused.
	writeFileSync(join(heroRemote, "hooks", "pre-receive"), `#!/bin/sh\nwhile read old new ref; do\n  if [ "$ref" = "refs/heads/main" ] && [ ! -e "${guard}" ] && git log --format=%s "$old..$new" | grep -q '^land('; then\n    echo "injected home refusal" >&2\n    exit 1\n  fi\ndone\nexit 0\n`, { mode: 0o755 });
	await assert.rejects(land({}, f.plain), /injected home refusal/);
	// The dive is still on deck: two more turns reach the home as they are recorded, and the person commits again.
	assert.equal(await f.run(["Three.", "--label", "Third"]), 0, f.err.join("\n"));
	assert.equal(await f.run(["Four.", "--label", "Fourth"]), 0, f.err.join("\n"));
	writeFileSync(join(f.hero, "late.txt"), "late");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-qm", "person late");
	writeFileSync(guard, "");
	const commits = diveCommits(f.hero, base, f.id);
	const turns = commits.filter((commit) => commit.turn);
	const late = commits.at(-1)!;
	f.out.length = 0;
	await land({}, f.plain);
	// The replay skips every turn the home holds: those followed by a later turn conflict, and the last is a clean no-op pick.
	assert.equal(f.out.join("\n"), [`landed ${f.id.slice(-6)}.ideas`, "- data: unchanged", "- hero: 2 commits onto main", ...turns.map((commit) => `- hero: already on main: ${commit.line}`), "- commits the failed land had not published, landed now:", `  hero: ${late.line}`].join("\n"));
	for (const label of ["First", "Second", "Third", "Fourth"]) assert.equal(heading(f.doc(f.id), label), 1, label);
});

test("land pushes a turn that could not be, with its record", async () => {
	const f = await setup("land-kept");
	const origin = git(f.hero, "remote", "get-url", "origin");
	git(f.hero, "remote", "set-url", "origin", join(f.hero, "..", "missing.git"));
	assert.equal(await f.run(["Offline.", "--label", "First"]), 0, f.err.join("\n"));
	git(f.hero, "remote", "set-url", "origin", origin);
	assert.equal(git(f.hero, "rev-list", "--count", "refs/remotes/origin/main..main"), "1", "the turn waits on the home");
	await land({}, f.plain);
	assert.equal(git(f.hero, "rev-list", "--count", "refs/remotes/origin/main..main"), "0");
	const doc = git(origin, "show", `refs/heads/main:kb/${f.id}.md`);
	assert.equal(heading(doc, "First"), 1);
	assert.match(doc, /outcome: landed/);
});

test("a packed dive's turns are on the home already, so jumping it again drops their copies", async () => {
	const f = await setup("repack");
	await f.run(["One.", "--label", "First"]);
	await pack({}, f.plain);
	await jump({ ref: f.id }, f.plain);
	assert.match(git(f.hero, "symbolic-ref", "--short", "HEAD"), /^nosedive-/);
	assert.equal(heading(f.doc(f.id), "First"), 1);
	assert.equal(git(f.hero, "rev-list", "--count", "main..HEAD"), "0", "the dive branch holds nothing the home lacks");
	await f.run(["Two.", "--label", "Second"]);
	await land({}, f.plain);
	assert.equal(heading(f.doc(f.id), "First") + heading(f.doc(f.id), "Second"), 2);
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
