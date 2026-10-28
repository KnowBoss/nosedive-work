// dive-on-deck
import assert from "node:assert/strict";
import { test } from "node:test";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { fixture } from "../test/harness.ts";

test("refuses when this checkout holds no dive, then gives the one it holds, its feat and each scope, and refuses one it does not hold", async () => {
	const f = fixture("dive-on-deck");
	const hero = findBridge(f.hero)!;
	assert.throws(() => diveOnDeck(hero, f.ctx), /this checkout of the hero holds no dive: `nosedive jump <feat or dive>` picks one up/);
	await jump({ ref: f.featId }, f.ctx);
	const dive = diveOnDeck(hero, f.ctx);
	assert.equal(dive.doc.fm.id, f.onDeck());
	assert.equal(dive.feat?.fm.id, f.featId);
	assert.deepEqual(
		dive.scopes.map(({ repoId, name, trunk, branch, ours }) => ({ repoId, name, trunk, branch, ours })),
		[{ repoId: f.repoId, name: "data", trunk: "main", branch: "work/ideas", ours: true }],
	);
	assert.equal(diveOnDeck(hero, f.ctx, f.onDeck()).doc.fm.id, f.onDeck());
	assert.throws(() => diveOnDeck(hero, f.ctx, f.featId), new RegExp(`this checkout of the hero holds no dive ${f.featId}`));
});
