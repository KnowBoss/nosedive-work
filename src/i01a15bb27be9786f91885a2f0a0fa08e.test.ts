// dive-on-deck
import assert from "node:assert/strict";
import { test } from "node:test";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i4b0709b1f9bf587aa8452f900544321e as jump } from "./i4b0709b1f9bf587aa8452f900544321e.ts";
import { fixture, git } from "../test/harness.ts";

test("refuses with nothing on deck, then gives the dive, its feat and each scope where it stands", async () => {
	const f = fixture("dive-on-deck");
	const ship = findBridge(f.ship)!;
	assert.throws(() => diveOnDeck(ship, f.ctx), /no dive is on deck: `nosedive jump <feat or dive>` picks one up/);
	await jump({ ref: f.featId }, f.ctx);
	const dive = diveOnDeck(ship, f.ctx);
	assert.equal(dive.doc.fm.id, f.onDeck());
	assert.equal(dive.feat?.fm.id, f.featId);
	assert.deepEqual(
		dive.scopes.map(({ repoId, name, trunk, branch, pin }) => ({ repoId, name, trunk, branch, pin })),
		[{ repoId: f.repoId, name: "data", trunk: "main", branch: "work/ideas", pin: git(f.remote, "rev-parse", "main") }],
	);
});
