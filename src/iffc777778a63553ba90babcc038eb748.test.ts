// bail [<dive>] --reason <why>
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";
import { iffc777778a63553ba90babcc038eb748 as bail } from "./iffc777778a63553ba90babcc038eb748.ts";
import { fixture, git } from "../test/harness.ts";

test("keeps what the dive held on its ref, uncommitted work included, records why, leaves the checkout at its base, and ends it", async () => {
	const f = fixture("bail");
	await jump({ ref: f.featId }, f.ctx);
	const id = f.onDeck();
	const base = git(f.checkout, "rev-parse", "HEAD");
	f.commit("idea.md", "an idea\n");
	const short = git(f.checkout, "rev-parse", "--short", "HEAD");
	writeFileSync(join(f.checkout, "draft.md"), "half\n");

	await bail({ why: "a better idea came along" }, f.ctx);
	const ref = `refs/nosedive/dives/${f.heroId}/main/${id}`;
	assert.equal(git(f.checkout, "rev-parse", "HEAD"), base);
	assert.equal(git(f.remote, "log", "-1", "--format=%s", ref), `feat(ideas): pack work in progress on ideas.${id.slice(-6)}`, "nothing it held is lost");
	assert.equal(git(f.remote, "log", "-1", "--format=%(trailers:only,unfold)", ref), "Co-Authored-By: nosedive test <noreply@nosedive.dev>", "and says nosedive made it, once");
	assert.equal(git(f.hero, "log", "-1", "--format=%s"), "feat(ideas): bail a better idea came along");
	assert.equal(git(f.hero, "log", "-1", "--format=%(trailers:only,unfold)"), "Co-Authored-By: nosedive test <noreply@nosedive.dev>");
	assert.equal(git(f.checkout, "branch", "--list", `*/${id}`), "", "its branch is gone");
	const doc = f.doc(id);
	assert.match(doc, /\nmeta:\n {2}feat: [0-9a-f-]{36}\n {2}outcome: bailed\n/);
	assert.match(doc, new RegExp(`\\n## \\d{4}-\\d\\d-\\d\\dT[\\d:.]+Z bailed\\n\\ndiver@example\\.com bailed: a better idea came along\\n\\n- data: held ${short} add idea\\.md; \\w+ feat\\(ideas\\): pack work in progress on ideas\\.${id.slice(-6)}, kept on ${ref}\\n- hero: held no commits\\n$`));
	assert.throws(() => f.onDeck());
	await assert.rejects(jump({ ref: id }, f.ctx), /is over: it bailed/);
});

test("needs a reason", async () => {
	const f = fixture("bail-reason");
	await assert.rejects(bail({ why: " " }, f.ctx), /bail needs a reason/);
});
