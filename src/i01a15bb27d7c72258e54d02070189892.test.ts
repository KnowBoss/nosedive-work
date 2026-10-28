// record-dive
import assert from "node:assert/strict";
import { test } from "node:test";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge, i01a13354845c7253a55b60bba87285d8 as findKbDoc } from "nosedive-core";
import { i01a15bb27d7c72258e54d02070189892 as recordDive } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { fixture, git } from "../test/harness.ts";

test("sets and clears meta, appends a dated section, commits and pushes the hero", () => {
	const f = fixture("record-dive");
	const hero = findBridge(f.hero)!;
	const doc = findKbDoc(hero.kbDir, f.featId)!;
	recordDive(hero, doc, { action: "jump", heading: "Jumped", summary: "picked up", meta: { diver: "a@example.com" }, lines: ["- one"] }, f.ctx);
	recordDive(hero, findKbDoc(hero.kbDir, f.featId)!, { action: "pack", heading: "Packed", summary: "put down", meta: { diver: null }, lines: ["- two"] }, f.ctx);
	const text = f.doc(f.featId);
	assert.doesNotMatch(text, /meta:/, "a meta emptied is dropped");
	assert.match(text, /\n## Jumped \d{4}-\d\d-\d\dT[\d:.]+Z\n\n- one\n\n## Packed [^\n]+\n\n- two\n$/);
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), "pack(ideas): put down");
	assert.equal(git(f.hero, "rev-parse", "HEAD"), git(f.hero, "rev-parse", "origin/main"), "pushed");
	assert.deepEqual(f.err, []);
});
