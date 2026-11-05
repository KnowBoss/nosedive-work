// dive-on-deck
import assert from "node:assert/strict";
import { test } from "node:test";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { digestOf, featNameOf, holderToken, type KindMeta } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, WORK_ID, diveBranch, diverOf, heroDoc, isDive, isWip, openDives, parseDiveBranch, tokenOf, wip, readScopes, scopesWith } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { fixture, git } from "../test/harness.ts";

test("refuses off a dive branch, then gives the dive the hero's branch names, its home, its feat and each scope, and refuses any other", async () => {
	const f = fixture("dive-on-deck");
	const hero = findBridge(f.hero)!;
	assert.throws(() => diveOnDeck(hero, f.ctx), /the hero is on no dive branch, so no dive is on deck: `nosedive jump <feat or dive>` picks one up/);
	await jump({ ref: f.featId }, f.ctx);
	const dive = diveOnDeck(hero, f.ctx);
	assert.equal(dive.doc.fm.id, f.onDeck());
	assert.equal(dive.home, "main");
	assert.equal(dive.branch, diveBranch(tokenOf(hero, "main"), f.onDeck()));
	assert.equal(dive.feat?.fm.id, f.featId);
	assert.deepEqual(
		dive.scopes.map(({ repoId, name, trunk, branch, ours }) => ({ repoId, name, trunk, branch, ours })),
		[{ repoId: f.repoId, name: "data", trunk: "main", branch: "work/ideas", ours: true }],
	);
	assert.equal(diveOnDeck(hero, f.ctx, f.onDeck()).doc.fm.id, f.onDeck());
	assert.throws(() => diveOnDeck(hero, f.ctx, f.featId), new RegExp(`the dive on deck is ideas\\.[0-9a-f]{6} \\(${f.onDeck()}\\), not ${f.featId}`));

	// A copy of the dive branch is another branch: the diver's token is the home's, which no other home shares.
	git(f.hero, "branch", "-m", "main", "renamed");
	assert.throws(() => diveOnDeck(hero, f.ctx), /dive ideas\.[0-9a-f]{6}'s home, the branch it was jumped from, is gone: recreate it/);
	git(f.hero, "branch", "-m", "renamed", "main");
});

test("work refs change independently of canonical schema versions and foreign dive names stay foreign", async () => {
	const f = fixture("canonical-scopes");
	await jump({ ref: f.featId }, f.ctx);
	const hero = findBridge(f.hero)!;
	const doc = heroDoc(hero, f.onDeck())!;
	const owner = WORK_ID;
	assert.equal(isDive(doc), true);
	const schema = digestOf(f.ctx.capes[1]!.kinds.dive as KindMeta);
	assert.match(schema, /^[0-9a-f]{12}$/);
	const canonical = { [owner]: { canonical: true, version: f.schemaVersion, schema } };
	assert.deepEqual((doc.fm.scopes as unknown[]).find((entry) => typeof entry === "object" && entry !== null && owner in entry), canonical);
	assert.deepEqual(readScopes(hero, doc).map((scope) => scope.repoId), [f.repoId]);
	const next = scopesWith(hero, doc, new Map([[f.repoId, "new-work-ref"], [hero.id!, "new-hero-ref"]]));
	assert.deepEqual(next.find((entry) => typeof entry === "object" && entry !== null && owner in entry), canonical);
	assert.deepEqual(next.find((entry) => typeof entry === "object" && entry !== null && f.repoId in entry), { [f.repoId]: { "work-branch": "work/ideas", ref: "new-work-ref" } });
	assert.equal(isDive({ ...doc, fm: { ...doc.fm, scopes: [] } }), false, "a hero-owned dive name is not a work dive");
	assert.equal(isDive({ ...doc, fm: { ...doc.fm, scopes: [{ [f.heroId]: { canonical: true, version: f.schemaVersion } }] } }), false);
});

test("a legacy feat naming a read-only repo by its bare quid is still read", () => {
	const f = fixture("legacy-scope", { readOnly: true });
	const feat = heroDoc(findBridge(f.hero)!, f.featId)!;
	assert.deepEqual(feat.fm.scopes, [f.repoId]);
	assert.equal(isDive(feat), false);
	assert.deepEqual(readScopes(findBridge(f.hero)!, feat), [{ repoId: f.repoId }]);
});

test("work's token for a branch is core's holder token on that branch, so a dive's diver is the holder of its home", async () => {
	const f = fixture("dive-holder");
	const hero = findBridge(f.hero)!;
	assert.equal(diverOf(hero, "main"), holderToken(f.hero), "core's, on the home");
	await jump({ ref: f.featId }, f.ctx);
	assert.deepEqual(openDives(hero).map((doc) => doc.fm.id), [f.onDeck()]);
	assert.equal(parseDiveBranch(git(f.hero, "symbolic-ref", "--short", "HEAD"))?.token, tokenOf(hero, "main"));
});

test("crud names the feat of the dive on deck while the hero is on its dive branch", { todo: "core's commit-subject finds the held dive by the holder token of the branch the hero is on; on a dive branch it must read the dive from the branch's name" }, async () => {
	const f = fixture("dive-holder-feat");
	await jump({ ref: f.featId }, f.ctx);
	assert.equal(featNameOf(findBridge(f.hero)!, []), "ideas");
});

test("a dive's work in progress is told by its name, in the subject pack writes now, or either it wrote before", async () => {
	const f = fixture("dive-wip");
	const hero = findBridge(f.hero)!;
	await jump({ ref: f.featId }, f.ctx);
	const dive = diveOnDeck(hero, f.ctx).doc;
	const name = String(dive.fm.name);
	assert.equal(isWip(dive, wip(dive)), true, "as pack names it");
	assert.equal(wip(dive), `pack(${name}): work in progress`);
	assert.equal(isWip(dive, `feat(ideas): pack work in progress on ${name}`), true, "as pack named it while feats grouped the loop's commits");
	assert.equal(isWip(dive, `feat(renamed): pack work in progress on ${name}`), true, "whatever the feat is called");
	assert.equal(isWip(dive, `pack: work in progress on ${name}`), true, "with no feat to name");
	assert.equal(isWip(dive, "feat(ideas): pack work in progress on ideas.other1"), false, "another dive's");
	assert.equal(isWip(dive, "pack(ideas.other1): work in progress"), false, "legacy, another dive's");
	assert.equal(isWip(dive, "add idea.md"), false);
});
