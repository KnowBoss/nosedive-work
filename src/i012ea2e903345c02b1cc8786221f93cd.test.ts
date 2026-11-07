// after crud dive
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { i01a1335480c776ba8945020d0af333eb as mintUuid } from "nosedive-core";
import { i01a14ab1d36771eea2bc6f13bdeb0526 as editKbDocs } from "nosedive-core";
import { i01a14b30ecc07ea18999d6255d636e39 as crudEdit } from "nosedive-core";
import { fixture, git } from "../test/harness.ts";
import { WORK_ID } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i012ea2e903345c02b1cc8786221f93cd as after } from "./i012ea2e903345c02b1cc8786221f93cd.ts";

/** A hero with a second feat, read-only on data, and a dive on the first as crud mints one, committed. */
function briefed(label: string) {
	const f = fixture(label);
	const dir = join(f.hero, dirname(git(f.hero, "ls-files", `*${f.featId}.md`)));
	const [dive, other] = [mintUuid(), mintUuid()];
	writeFileSync(join(dir, `${other}.md`), `---\nkind: memo\nid: ${other}\nname: other\ngist: "Other"\nscopes:\n  - ${f.repoId}\n---\n\n# Other\n`);
	writeFileSync(
		join(dir, `${dive}.md`),
		`---\nkind: dive\nid: ${dive}\nname: ideas.briefed\ngist: "Address review comments"\nscopes:\n  - ${WORK_ID}:\n      canonical: true\nmeta:\n  feat: ${f.featId}\n---\n\n# Briefed\n\n## Brief\n\nRead the comments.\n`,
	);
	git(f.hero, "add", "-A");
	git(f.hero, "commit", "-q", "-m", "briefed");
	const read = (id: string) => git(f.hero, "show", `HEAD:${git(f.hero, "ls-files", `*${id}.md`)}`);
	/** Runs the after gate as crud would on the dive, minted when `feat` is not given, else with its feat changed to it. */
	const run = async (feat?: string) => {
		const edit = editKbDocs(f.hero, "test");
		const doc = edit.doc(dive);
		const was = { fm: doc.yaml.toJS() as Record<string, unknown>, body: doc.body };
		if (feat) crudEdit(edit, dive, "meta", { feat }, f.ctx);
		const now = { fm: doc.yaml.toJS() as Record<string, unknown>, body: doc.body };
		const crud = (target: string, field: string, value: unknown) => crudEdit(edit, target, field, value, f.ctx);
		await after({ bridge: edit.bridge, edit, doc, before: feat ? was : undefined, after: now, crud } as never);
		edit.commit();
	};
	return { f, dive, other, read, run };
}

test("a dive crud mints gets its feat's scopes, its canonical entry kept, and its feat's dives.feat link", async () => {
	const { f, dive, read, run } = briefed("dive-shape-mint");
	await run();
	assert.match(read(dive), new RegExp(`scopes:\\n {2}- ${WORK_ID}:\\n {6}canonical: true\\n {2}- ${f.repoId}:\\n {6}work-branch: work/ideas\\n`));
	assert.match(read(dive), /\n## Brief\n\nRead the comments\.$/, "its brief untouched");
	assert.match(read(f.featId), new RegExp(`- [^\\n]*${dive}\\.md:\\n {6}rel: dives\\.feat\\n`));
});

test("a dive not yet jumped moves to another feat's scopes and link", async () => {
	const { f, dive, other, read, run } = briefed("dive-shape-move");
	await run();
	await run(other);
	assert.doesNotMatch(read(dive), /work-branch/, "read-only on data, as the other feat is");
	assert.match(read(dive), new RegExp(`- ${f.repoId}`));
	assert.doesNotMatch(read(f.featId), new RegExp(dive), "the old feat no longer links it");
	assert.match(read(other), new RegExp(`${dive}\\.md:\\n {6}rel: dives\\.feat\\n`));
});
