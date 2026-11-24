import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import * as core from "nosedive-core";
import type { Cape } from "nosedive-core";
import { i01a1335480147d0686528aee80f8ee34 as namespacedUuid, i01a1335487e477549d84a6fc2c901bf6 as describeCape, i01a1336a958f71c7beec4db3195c7966 as launch } from "nosedive-core";
import { fixture, git } from "../test/harness.ts";
import { isOwnOrigin, normalizedOrigin } from "./i01a204ebdb4a799ba8119e92b0e93cc5.ts";
import { i01a1b45b04a079a494fed25a3665456d as diveShape } from "./i01a1b45b04a079a494fed25a3665456d.ts";
import { i01a18f4542c670ccb111f6bd564e1f50 as turnGate } from "./i01a18f4542c670ccb111f6bd564e1f50.ts";
import { i0735c57383365d4ca5395ea24f5b0649 as pack } from "./i0735c57383365d4ca5395ea24f5b0649.ts";
import { i2bcf8d7ee2645df5b261ee1b2135d190 as land } from "./i2bcf8d7ee2645df5b261ee1b2135d190.ts";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { iffc777778a63553ba90babcc038eb748 as bail } from "./iffc777778a63553ba90babcc038eb748.ts";

type Fixture = ReturnType<typeof fixture>;
const OWN = /on origin .*which is the hero's own .* or cannot be shown different.*give .* its own repo, or drop its work branch/s;
const heroRef = (f: Fixture, id: string) => `refs/nosedive/${f.heroId}/dives/${id}`;
const refs = (dir: string) => git(dir, "for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/nosedive");

/** What a refusal must leave alone: every origin's refs, the hero's HEAD and the dive's checkout. */
function state(f: Fixture): string[] {
	return [f.heroRemote, f.remote].map(refs).concat(git(f.hero, "rev-parse", "HEAD"), existsSync(f.checkout) ? git(f.checkout, "rev-parse", "HEAD") : "");
}

test("origin identity normalizes local, file, ssh and scp forms, and compares push URLs too", async () => {
	const f = fixture("origin-urls");
	const key = normalizedOrigin(f.remote, f.hero);
	assert.ok(key);
	assert.equal(normalizedOrigin(pathToFileURL(f.remote).href + "/", f.hero), key);
	assert.equal(normalizedOrigin(f.remote.replace(/\.git$/, ""), f.hero), key);
	assert.equal(normalizedOrigin("ssh://git@EXAMPLE.com:22/team/App.git/", f.hero), normalizedOrigin("git@example.COM:team/App", f.hero));
	assert.equal(normalizedOrigin("https://example.com/team/App.git", f.hero), normalizedOrigin("https://user@example.com/team/App", f.hero));
	assert.notEqual(normalizedOrigin("git@example.com:team/app", f.hero), normalizedOrigin("git@example.com:team/App", f.hero));
	assert.equal(normalizedOrigin("ext::unknown", f.hero), undefined);
	assert.equal(isOwnOrigin(f.hero, undefined, "git@example.com:team/app.git"), false, "a declared origin before hydration");
	git(f.hero, "config", `url.${f.heroRemote}.pushInsteadOf`, "git@example.com:team/app.git");
	assert.equal(isOwnOrigin(f.hero, undefined, "git@example.com:team/app.git"), true, "unless it is pushed to the hero's");
	git(f.hero, "config", "--unset-all", `url.${f.heroRemote}.pushInsteadOf`);
	await jump({ ref: f.featId }, f.ctx);
	assert.equal(isOwnOrigin(f.hero, f.checkout, undefined), false);
	git(f.checkout, "remote", "set-url", "--push", "origin", f.heroRemote);
	assert.equal(isOwnOrigin(f.hero, f.checkout, undefined), true, "a push URL that is the hero's counts");
	assert.equal(isOwnOrigin(f.hero, undefined, undefined), true, "an origin that cannot be read counts as the hero's");
});

// own.sh's scenarios (land, pack, pack2, wip) all begin with this jump, so each ends here with nothing on the hero's main.
for (const alias of ["the same path", "a file:// URL", "no trailing .git", "insteadOf"]) {
	for (const target of ["feat", "dive"]) {
		test(`jump refuses a ${target} whose writable scope's origin is the hero's own, as ${alias}, and writes nothing`, async () => {
			const f = fixture(`own-${target}`, { ownScope: true });
			if (alias === "a file:// URL") git(f.hero, "remote", "set-url", "origin", pathToFileURL(f.heroRemote).href);
			if (alias === "no trailing .git") git(f.hero, "remote", "set-url", "origin", f.heroRemote.replace(/\.git$/, ""));
			if (alias === "insteadOf") {
				git(f.hero, "config", `url.${f.heroRemote}.insteadOf`, "hero-alias:");
				git(f.hero, "remote", "set-url", "origin", "hero-alias:");
			}
			const ref = target === "dive" ? f.plan() : f.featId;
			const before = state(f);
			await assert.rejects(jump({ ref }, f.ctx), OWN);
			assert.deepEqual(state(f), before);
			assert.ok(!existsSync(f.checkout), "no checkout was made");
			assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "main", "no dive branch was cut");
		});
	}
}

test("a separate repo is unaffected: jump, pack and land go as they did", async () => {
	const f = fixture("separate");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const sha = f.commit("hello", "separate\n");
	await pack({}, f.ctx);
	assert.equal(refs(f.remote).split("\n").find((line) => line.startsWith("refs/nosedive")), `${heroRef(f, id)} ${sha}`);
	await jump({ ref: id }, f.ctx);
	await land({}, f.ctx);
	assert.equal(git(f.remote, "show", "refs/heads/work/ideas:hello"), "separate");
	assert.equal(git(f.remote, "ls-tree", "--name-only", "refs/heads/main"), "README.md");
});

test("a remote changed after jump to the hero's own is refused by land and pack, and bail leaves its refs and checkout", async () => {
	const f = fixture("own-after-jump");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	f.commit("hello", "unreviewed\n");
	git(f.checkout, "remote", "set-url", "origin", f.heroRemote);
	const before = state(f);
	await assert.rejects(land({}, f.ctx), OWN);
	await assert.rejects(pack({}, f.ctx), OWN);
	assert.deepEqual(state(f), before);
	assert.equal(f.onDeck(), id, "the dive stays on deck");

	const head = git(f.checkout, "rev-parse", "HEAD");
	await bail({ reason: "wrong origin" }, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), head, "its checkout is as it was");
	assert.equal(f.onDeck(), id, "and so is its branch");
	assert.equal(git(f.heroRemote, "for-each-ref", "refs/nosedive"), "", "no ref was made");
	assert.match(git(f.heroRemote, "show", `main:kb/${id}.md`), /outcome: bailed/);
	assert.ok(!git(f.heroRemote, "ls-tree", "--name-only", "main").split("\n").includes("hello"));
});

test("pass --turn re-checks the scopes too", async () => {
	const f = fixture("own-turn");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const work = f.ctx.capes[1]!;
	const source = describeCape(dirname(dirname(fileURLToPath(import.meta.url))));
	const declared = source.kinds.dive as Record<string, unknown>;
	const index = { [namespacedUuid("01a18f45-42c6-70cc-b111-f6bd564e1f50", work.id)]: turnGate, [namespacedUuid("01a1b45b-04a0-79a4-94fe-d25a3665456d", work.id)]: diveShape };
	const cape: Cape = { ...work, docs: source.docs, index, kinds: { ...work.kinds, dive: { ...(work.kinds.dive as object), links: declared.links } } };
	f.ctx.capes = [core as Cape, cape];
	git(f.checkout, "remote", "set-url", "origin", f.heroRemote);
	const doc = f.doc(id);
	assert.notEqual(await launch(["pass", "--turn", id, "a turn"], f.ctx), 0);
	assert.match(f.err.join("\n"), OWN);
	assert.equal(f.doc(id), doc);
});

test("an already-packed dive with an own scope is refused untouched by jump, and bail ends it leaving its refs", async () => {
	const f = fixture("own-packed");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const sha = f.commit("hello", "unreviewed\n");
	await pack({}, f.ctx);
	// As an older nosedive left it: the scope's origin the hero's own, holding the dive's ref.
	git(f.checkout, "remote", "set-url", "origin", f.heroRemote);
	git(f.checkout, "push", "-q", "origin", `${heroRef(f, id)}:${heroRef(f, id)}`);
	const before = state(f);
	await assert.rejects(jump({ ref: id }, f.ctx), new RegExp(`${heroRef(f, id)} is at ${sha}: compare it with work/ideas by hand, then bail`));
	assert.deepEqual(state(f), before);

	await bail({ dive: id, reason: "unsafe origin" }, f.ctx);
	assert.equal(git(f.heroRemote, "rev-parse", heroRef(f, id)), sha, "its ref is as it was, nothing deleted or rewritten");
	assert.equal(git(f.hero, "rev-parse", "HEAD"), git(f.heroRemote, "rev-parse", "main"));
	assert.match(f.doc(id), /outcome: bailed/);
	assert.ok(!git(f.heroRemote, "ls-tree", "--name-only", "main").split("\n").includes("hello"), "nothing of the scope's reached the hero's main");
});
