import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import * as core from "nosedive-core";
import type { Cape } from "nosedive-core";
import { i01a1335480147d0686528aee80f8ee34 as namespacedUuid, i01a1335480c776ba8945020d0af333eb as mintUuid, i01a1335487e477549d84a6fc2c901bf6 as describeCape, i01a1336a958f71c7beec4db3195c7966 as launch } from "nosedive-core";
import { fixture, git } from "../test/harness.ts";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { i01a18f4542c670ccb111f6bd564e1f50 as turn } from "./i01a18f4542c670ccb111f6bd564e1f50.ts";

const TURN = "01a18f45-42c6-70cc-b111-f6bd564e1f50";
const source = describeCape(dirname(dirname(fileURLToPath(import.meta.url))));
const timestamp = /^## (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d))(?: (.*))?$/m;

async function setup(label: string) {
	const f = fixture(`turn-${label}`);
	await jump({ ref: f.featId }, f.ctx);
	const work = f.ctx.capes[1]!;
	const dive = work.kinds.dive as Record<string, unknown>;
	const declaredDive = source.kinds.dive as Record<string, unknown>;
	const cape: Cape = {
		...work,
		docs: source.docs,
		index: { [namespacedUuid(TURN, work.id)]: turn },
		kinds: { ...work.kinds, dive: { ...dive, links: declaredDive.links } },
	};
	f.ctx.capes = [core as Cape, cape];
	const id = f.onDeck();
	const run = (args: string[]) => launch(["pass", "--turn", id, ...args], f.ctx);
	return { ...f, id, run };
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
	assert.equal((text.match(/^## \d{4}-/gm) ?? []).length, 2);
	assert.ok(text.indexOf("First turn") < text.indexOf("Second turn"));
	assert.match(text, /First\n\nFirst turn[\s\S]*Second\n\nSecond turn\n$/);
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
