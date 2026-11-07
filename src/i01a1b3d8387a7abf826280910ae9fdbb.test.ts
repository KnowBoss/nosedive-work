// dive-branch-dashes
import assert from "node:assert/strict";
import { test } from "node:test";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { fixture, git } from "../test/harness.ts";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, diveBranch, tokenOf } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a1b3d8387a7abf826280910ae9fdbb as diveBranchDashes } from "./i01a1b3d8387a7abf826280910ae9fdbb.ts";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";

test("a dive branch of the old shape is renamed in the hero and its scope's checkout, and the dive is on deck again", async () => {
	const f = fixture("dive-branch-dashes");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const token = tokenOf(findBridge(f.hero)!, "main");
	const slashed = `nosedive/${token}/${id}`;
	git(f.hero, "branch", "-m", diveBranch(token, id), slashed);
	git(f.checkout, "branch", "-m", diveBranch(token, id), slashed);
	git(f.hero, "branch", "nosedive/0123456789ab/01a1b3d8-0000-7000-8000-000000000000");
	const out: string[] = [];
	const ctx = { capes: [], out: (text: string) => void out.push(text) } as never;

	assert.deepEqual(diveBranchDashes(f.hero, ctx), []);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), diveBranch(token, id));
	assert.equal(git(f.checkout, "symbolic-ref", "--short", "HEAD"), diveBranch(token, id));
	assert.ok(git(f.hero, "branch", "--list", "nosedive/0123456789ab/*"), "another checkout's dive branch is left alone");
	assert.deepEqual(out, ["dive-branch-dashes: renamed 2 dive branches to nosedive-<token>-<dive id>"]);
	assert.equal(String(diveOnDeck(findBridge(f.hero)!, f.ctx).doc.fm.id), id);
	assert.deepEqual(diveBranchDashes(f.hero, ctx), [], "running it again renames nothing");
	assert.equal(out.length, 1);
});
