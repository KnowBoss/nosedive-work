// run-git
import assert from "node:assert/strict";
import { test } from "node:test";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";
import { tempDir } from "../test/harness.ts";

test("says whether git worked, with its output or its complaint", () => {
	const dir = tempDir("run-git");
	assert.deepEqual(runGit(dir, "init", "-q", "-b", "main"), { ok: true, text: "" });
	assert.equal(runGit(dir, "symbolic-ref", "--short", "HEAD").text, "main");
	const failed = runGit(dir, "rev-parse", "--verify", "nope");
	assert.equal(failed.ok, false);
	assert.match(failed.text, /fatal/);
});
