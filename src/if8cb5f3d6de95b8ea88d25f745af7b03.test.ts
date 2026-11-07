// jump [<ref>]
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { i0735c57383365d4ca5395ea24f5b0649 as pack } from "./i0735c57383365d4ca5395ea24f5b0649.ts";
import { i2bcf8d7ee2645df5b261ee1b2135d190 as land } from "./i2bcf8d7ee2645df5b261ee1b2135d190.ts";
import { i01a1335480c776ba8945020d0af333eb as mintUuid } from "nosedive-core";
import { fixture, git } from "../test/harness.ts";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { diveBranch, tokenOf } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";

/** The dive branch a dive jumped from the hero's main has. */
const branchOf = (f: ReturnType<typeof fixture>, id: string) => diveBranch(tokenOf(findBridge(f.hero)!, "main"), id);

test("a feat the root reaches gets a dive with its scopes, naming the feat and linked from it as dives.feat, the hero and its scope on its dive branch, held by this checkout, its bookkeeping on the home it was jumped from", async () => {
	const f = fixture("jump-feat");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const dive = f.doc(id);
	const trunk = git(f.remote, "rev-parse", "main");
	assert.match(dive, new RegExp(`^---\\nkind: dive\\nid: ${id}\\nname: ideas\\.${id.slice(-6)}\\n`));
	assert.match(dive, new RegExp(`scopes:\\n {2}- ${f.repoId}:\\n {6}work-branch: work/ideas\\n`));
	assert.match(dive, new RegExp(`\\nmeta:\\n {2}feat: ${f.featId}\\n {2}diver: diver@example\\.com#[0-9a-f]{12}\\n`));
	assert.doesNotMatch(dive, /\nlinks:/, "a dive links nothing back");
	assert.match(dive, /\n## \d{4}-\d\d-\d\dT[\d:.]+Z jumped\n\ndiver@example\.com picked it up\.\n\n- data: workspace\/data on \w+, working work\/ideas\n$/);
	assert.match(f.doc(f.featId), new RegExp(`- kb/${id}\\.md:\\n {6}rel: dives\\.feat\\n`));
	assert.equal(git(f.checkout, "symbolic-ref", "--short", "HEAD"), branchOf(f, id), "the scope on the dive branch");
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branchOf(f, id), "and the hero");
	assert.equal(git(f.hero, "rev-parse", "main"), git(f.hero, "rev-parse", "HEAD"), "cut from its home after the jump record");
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), trunk, "with no work branch yet, it starts at trunk");
	assert.match(git(f.hero, "log", "-1", "--format=%s"), /^jump\(ideas\.[0-9a-f]{6}\): diver@example\.com picked it up$/, "the command first, then the dive it acted on");
	assert.equal(git(f.hero, "log", "-1", "--format=%(trailers:only,unfold)"), "Co-Authored-By: nosedive test <noreply@nosedive.dev>", "which says nosedive made it, once");
	assert.equal(git(f.hero, "status", "--porcelain"), "", "the feat's link rides the same commit");
	assert.equal(git(f.hero, "rev-parse", "HEAD"), git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0], "the bookkeeping pushed to the home's upstream");
	assert.deepEqual(f.out.slice(-3), [`dive  kb/${id}.md`, `feat  kb/${f.featId}.md`, "data  workspace/data"]);
});

test("a hero with a branch named nosedive still gets its dive branch, which is one segment", async () => {
	const f = fixture("jump-nosedive-branch");
	git(f.hero, "branch", "nosedive");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	assert.match(branchOf(f, id), new RegExp(`^nosedive-[0-9a-f]{12}-${id}$`));
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branchOf(f, id));
	assert.equal(git(f.checkout, "symbolic-ref", "--short", "HEAD"), branchOf(f, id));
});

test("refuses a second dive while on a dive branch or holding one, a doc that is neither feat nor dive, and a dive another checkout holds; jumping the dive on deck again records nothing", async () => {
	const f = fixture("jump-refusals");
	await assert.rejects(jump({ ref: f.repoId }, f.ctx), /data is no feat: nothing reaches it from a root of the hero through a .feat link; link it from a feat first/);
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	await assert.rejects(jump({ ref: f.featId, sure: true }, f.ctx), new RegExp(`the hero is on dive ideas\\.${id.slice(-6)} \\(${id}\\)'s branch: pack, land or bail it first`));

	// Off its dive branch, the checkout still holds it: only that dive can be jumped.
	git(f.hero, "switch", "-q", "main");
	await assert.rejects(jump({ ref: f.featId, sure: true }, f.ctx), new RegExp(`this checkout has dive branch ${branchOf(f, id).replace(/\//g, "\\/")}: switch to it, then pack, land or bail it first`));
	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branchOf(f, id), "back onto it");

	const other = join(f.hero, "..", "other-checkout");
	git(f.hero, "worktree", "add", "-q", "-b", "other", other, "main");
	git(other, "branch", "-q", "-u", "origin/main");
	await assert.rejects(jump({ ref: id }, { ...f.ctx, cwd: other }), new RegExp(`dive ideas\\.${id.slice(-6)} is held by diver@example\\.com in another checkout of the hero: pack it there \\(held-by-checkout\\)`));
	git(f.hero, "config", "user.email", "other@example.com");
	await assert.rejects(jump({ ref: id }, { ...f.ctx, cwd: other }), new RegExp(`dive ideas\\.${id.slice(-6)} is held by diver@example\\.com \\(held-by-checkout\\)$`));
	git(f.hero, "config", "user.email", "diver@example.com");

	const before = git(f.hero, "rev-parse", "HEAD");
	writeFileSync(join(f.checkout, "draft.md"), "mine\n");
	await jump({}, f.ctx);
	assert.equal(git(f.hero, "rev-parse", "HEAD"), before, "nothing recorded");
	assert.equal(git(f.checkout, "status", "--porcelain"), "?? draft.md", "its checkout is the diver's to change");
});

test("a dive minted from another clone sharing the home's upstream is found once fetched, and refused as held there; a dirty hero is refused before anything", async () => {
	const f = fixture("jump-stale");
	const other = join(f.hero, "..", "other-clone");
	git(f.hero, "clone", "-q", git(f.hero, "remote", "get-url", "origin"), other);
	git(other, "config", "user.name", "Work Test");
	git(other, "config", "user.email", "diver@example.com");
	await jump({ ref: f.featId }, { ...f.ctx, cwd: other });
	// The dive is the doc jump's bookkeeping added beside the feat.
	const id = git(other, "diff", "--name-only", "HEAD^", "HEAD").split("\n").map((path) => /([0-9a-f-]{36})\.md$/.exec(path)?.[1]).find((each) => each && each !== f.featId)!;

	writeFileSync(join(f.hero, "scratch.md"), "mine\n");
	await assert.rejects(jump({ ref: id }, f.ctx), /the hero has uncommitted changes, and jump switches its branch: commit them first \(jump-needs-clean-tree\)/);
	git(f.hero, "clean", "-qf");
	await assert.rejects(jump({ ref: id }, f.ctx), new RegExp(`dive ideas\\.${id.slice(-6)} is held by diver@example\\.com in another checkout of the hero: pack it there`));
	assert.equal(git(f.hero, "rev-parse", "main"), git(other, "rev-parse", "main"), "main fast-forwarded to the other clone's record");
});

test("without a ref, takes the one dive waiting for the pilot, and refuses when none is", async () => {
	const f = fixture("jump-bare");
	await assert.rejects(jump({}, f.ctx), /no dive waits for you here: `nosedive jump <feat or dive>` names one/);
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	await pack({}, f.ctx);
	await jump({}, f.ctx);
	assert.equal(f.onDeck(), id);
});

test("picks packed work up on its work branch's new tip", async () => {
	const f = fixture("jump-rebase");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	f.commit("idea.md", "mine\n");
	await pack({}, f.ctx);

	// Someone else lands on the work branch meanwhile.
	const other = join(f.hero, "..", "other");
	git(f.hero, "clone", "-q", f.remote, other);
	writeFileSync(join(other, "theirs.md"), "theirs\n");
	git(other, "add", "-A");
	git(other, "-c", "user.name=O", "-c", "user.email=o@example.com", "commit", "-q", "-m", "theirs");
	git(other, "push", "-q", "origin", "HEAD:refs/heads/work/ideas");
	const tip = git(other, "rev-parse", "HEAD");

	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.checkout, "rev-parse", "HEAD^"), tip, "the work sits on the branch's tip");
	assert.equal(git(f.checkout, "log", "-1", "--format=%s"), "add idea.md");
	assert.match(f.doc(id), /, working work\/ideas; rebased onto work\/ideas\n$/);
});

test("replays the dive's hero work on its bookkeeping, and refuses while the home holds commits its upstream lacks", async () => {
	const f = fixture("jump-hero");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	writeFileSync(join(f.hero, "kb", "note.md"), "a note\n");
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-q", "-m", "a note");
	writeFileSync(join(f.hero, "kb", "draft.md"), "half\n");
	await pack({}, f.ctx);
	assert.equal(existsSync(join(f.hero, "kb", "note.md")), false, "the hero is back home");
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "main");

	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), "a note");
	assert.match(git(f.hero, "log", "-1", "--format=%s", "HEAD^"), /^jump\(ideas\.[0-9a-f]{6}\): diver@example\.com picked it up$/);
	assert.equal(git(f.hero, "status", "--porcelain"), "?? kb/draft.md", "uncommitted again");
	assert.match(f.doc(id), /\n- hero: 2 commits replayed\n$/);

	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-q", "-m", "a draft");
	await land({}, f.ctx);
	git(f.hero, "commit", "-q", "--allow-empty", "-m", "stray");
	await assert.rejects(jump({ ref: f.featId, sure: true }, f.ctx), /main holds 1 commit origin\/main lacks: push it first/);
});

test("moves a checkout left from other work, keeping commits origin lacks on an orphan ref, and refuses one with uncommitted changes", async () => {
	const f = fixture("jump-orphan");
	await jump({ ref: f.featId }, f.ctx);
	f.commit("idea.md", "an idea\n");
	await land({}, f.ctx);
	const stray = f.commit("stray.md", "stray\n");

	writeFileSync(join(f.checkout, "draft.md"), "draft\n");
	await assert.rejects(jump({ ref: f.featId }, f.ctx), /ideas has 1 child doc, dives included, so it is no leaf, so next does not list it: jump it --sure to start a dive on it anyway \(sure-off-fringe\)/);
	await assert.rejects(jump({ ref: f.featId, sure: true }, f.ctx), /jump would lose work, so nothing moved:\n {2}workspace\/data has uncommitted changes or untracked files/);
	git(f.checkout, "clean", "-qf");

	await jump({ ref: f.featId, sure: true }, f.ctx);
	const id = f.onDeck();
	assert.equal(f.remoteRef(`refs/nosedive/${f.heroId}/orphans/${stray}`), stray);
	assert.equal(git(f.checkout, "symbolic-ref", "--short", "HEAD"), branchOf(f, id));
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), f.remoteRef("refs/heads/work/ideas"), "a feat's dives stack on its work branch");
	assert.match(f.doc(id), new RegExp(`; its 1 commit origin lacked kept on refs/nosedive/${f.heroId}/orphans/${stray}\\n$`));
});

test("a feat under a hero's second root gets its dive in that root's directory, and packs and jumps again", async () => {
	const f = fixture("jump-roots", { roots: true });
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	assert.match(f.doc(id), /^---\nkind: dive\n/, "minted beside its feat in ./docs");
	assert.match(f.doc(f.featId), new RegExp(`- docs/${id}\.md:\n {6}rel: dives\.feat\n`));
	await pack({}, f.ctx);
	await jump({ ref: id }, f.ctx);
	assert.equal(f.onDeck(), id);
	assert.equal(git(f.hero, "status", "--porcelain"), "");
});

test("pack, jump and land preserve the canonical version while work refs keep their lease meaning", async () => {
	const f = fixture("canonical-loop");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const versionLine = `      version: ${f.schemaVersion}`;
	assert.ok(f.doc(id).includes(versionLine));
	const commit = f.commit("work.txt", "one\n");
	await pack({}, f.ctx);
	assert.ok(f.doc(id).includes(versionLine));
	assert.match(f.doc(id), new RegExp(`ref: ${commit}`));
	await jump({ ref: id }, f.ctx);
	assert.ok(f.doc(id).includes(versionLine));
	assert.match(f.doc(id), new RegExp(`ref: ${commit}`));
	await land({}, f.ctx);
	assert.ok(f.doc(id).includes(versionLine), "land never rewrites a schema version");
});

test("a meta entry beside the canonical one survives jump, pack and land untouched while work scopes still work", async () => {
	const f = fixture("meta-scope");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const meta = `  - ${mintUuid()}:\n      version: 0123abc\n      schema: 0123456789ab\n      meta:\n        note: kept\n`;
	writeFileSync(join(f.hero, "kb", `${id}.md`), f.doc(id).replace("\nscopes:\n", `\nscopes:\n${meta}`));
	git(f.hero, "commit", "-qam", "meta entry");
	git(f.hero, "push", "-q", "origin", "HEAD:main");
	const canonical = `      canonical: true\n      version: ${f.schemaVersion}\n`;
	const intact = () => {
		assert.ok(f.doc(id).includes(meta), "the meta entry is carried as it was");
		assert.ok(f.doc(id).includes(canonical), "the canonical entry is carried as it was");
	};
	intact();
	const commit = f.commit("work.txt", "one\n");
	await pack({}, f.ctx);
	intact();
	assert.match(f.doc(id), new RegExp(`ref: ${commit}`));
	await jump({ ref: id }, f.ctx);
	intact();
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), commit);
	await land({}, f.ctx);
	intact();
});

test("an unpublished dive schema refuses before jump moves a scope", async () => {
	const f = fixture("unpublished-dive");
	newSchema(f);
	await assert.rejects(jump({ ref: f.featId }, f.ctx), /land|push/);
	assert.equal(existsSync(f.checkout), false);
});

test("a dive schema on the feat's work branch is accepted and pinned", async () => {
	const f = fixture("work-branch-dive");
	const version = newSchema(f);
	git(f.schemaRepo, "push", "-q", "origin", "HEAD:refs/heads/work/ideas");
	await jump({ ref: f.featId }, f.ctx);
	assert.ok(f.doc(f.onDeck()).includes(`      version: ${version}\n`));
	assert.match(f.doc(f.onDeck()), /\n {6}schema: [0-9a-f]{12}\n/);
});

/** Commits a change to the dive schema's repo that origin's trunk lacks, and makes it the kind's version. */
function newSchema(f: ReturnType<typeof fixture>): string {
	writeFileSync(join(f.schemaRepo, "schema.txt"), "new schema\n");
	git(f.schemaRepo, "add", "schema.txt");
	git(f.schemaRepo, "commit", "-q", "-m", "new schema");
	const version = git(f.schemaRepo, "rev-parse", "HEAD");
	(f.ctx.capes[1]!.kinds.dive as { version: string }).version = version;
	return version;
}

test("refuses a home with no upstream, so no record is stranded in a local branch", async () => {
	const f = fixture("jump-upstream");
	git(f.hero, "switch", "-q", "-c", "local-only");
	await assert.rejects(jump({ ref: f.featId }, f.ctx), /local-only has no upstream, so the dive's records would be stranded here: push it first, as `git push -u origin local-only`$/);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "local-only", "nothing moved");
});

test("a dive jumped from a pushed branch keeps every record and its hero work there, trunk untouched, and the loop returns to it", async () => {
	const f = fixture("jump-home");
	const trunk = git(f.hero, "rev-parse", "origin/main");
	git(f.hero, "switch", "-q", "-c", "spec");
	writeFileSync(join(f.hero, "SPEC.md"), "the spec\n");
	git(f.hero, "add", "SPEC.md");
	git(f.hero, "commit", "-q", "-m", "spec");
	git(f.hero, "push", "-q", "-u", "origin", "spec");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	assert.equal(git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0], trunk, "trunk on origin never moved");
	assert.match(git(f.hero, "log", "-1", "--format=%s", "origin/spec"), /^jump\(ideas\./, "the record is on the home's upstream");
	writeFileSync(join(f.hero, "NOTE.md"), "hero work\n");
	git(f.hero, "add", "NOTE.md");
	git(f.hero, "commit", "-q", "-m", "hero note");
	await pack({}, f.ctx);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "spec", "back home");
	assert.equal(git(f.hero, "log", "--format=%s", "spec").includes("hero note"), false, "the work waits on the dive's ref");
	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), "hero note", "replayed on the dive branch");
	await land({}, f.ctx);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), "spec");
	assert.deepEqual(git(f.hero, "log", "-3", "--format=%s", "origin/spec").split("\n").map((line) => line.split(":")[0]), [`land(ideas.${id.slice(-6)})`, "hero note", `jump(ideas.${id.slice(-6)})`], "the hero's work bookended on the home's upstream");
	assert.equal(git(f.hero, "ls-remote", "origin", "refs/heads/main").split("\t")[0], trunk, "and still not on trunk");
});

test("a dive this checkout holds whose branch is gone is jumped again without a record, its packed hero work replayed; on its branch, a jump sets a lost scope checkout up again", async () => {
	const f = fixture("jump-lost");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const work = f.commit("idea.md", "an idea\n");
	git(f.checkout, "push", "-q", "origin", `HEAD:refs/heads/work/ideas`);

	// The scope checkout lost: jumping the dive on deck puts it back, the dive branch's commit kept.
	const cache = git(f.checkout, "rev-parse", "--git-common-dir");
	git(cache, "worktree", "remove", "--force", f.checkout);
	const records = git(f.hero, "rev-list", "--count", "HEAD");
	await jump({}, f.ctx);
	assert.equal(git(f.hero, "rev-list", "--count", "HEAD"), records, "nothing recorded");
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), work, "the scope back at the dive's work");

	// The hero's dive branch lost: jumping the dive cuts it again from home.
	const branch = git(f.hero, "symbolic-ref", "--short", "HEAD");
	git(f.hero, "switch", "-q", "main");
	git(f.hero, "branch", "-q", "-D", branch);
	const before = git(f.hero, "rev-parse", "main");
	await jump({ ref: id }, f.ctx);
	assert.equal(git(f.hero, "symbolic-ref", "--short", "HEAD"), branch, "on its branch again");
	assert.equal(git(f.hero, "rev-parse", "main"), before, "no record");
});

test("a dive legacy left held by a bare email is taken over by a checkout of that email, and refused to anyone else (legacy-bare-diver)", async () => {
	const f = fixture("jump-bare-diver");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	await pack({}, f.ctx);
	const path = join(f.hero, "kb", `${id}.md`);
	const bare = (email: string) => {
		const text = f.doc(id).replace(/\n  packer: [^\n]+\n/, "\n").replace(/\n  diver: [^\n]*\n/, "\n");
		assert.ok(text.includes("\nmeta:\n"), "the packed dive has meta");
		writeFileSync(path, text.replace("\nmeta:\n", `\nmeta:\n  diver: ${email}\n`));
		git(f.hero, "commit", "-qam", `legacy diver ${email}`);
		git(f.hero, "push", "-q");
	};
	bare("someone@example.com");
	await assert.rejects(jump({ ref: id }, f.ctx), /is held by someone@example\.com, in no checkout in particular: only a checkout whose git user\.email is someone@example\.com can take it over \(legacy-bare-diver\)/);
	bare("diver@example.com");
	await jump({ ref: id }, f.ctx);
	assert.equal(f.onDeck(), id);
	assert.match(f.doc(id), /\n  diver: diver@example\.com#[0-9a-f]{12}\n/);
});
