// before crud dive
import assert from "node:assert/strict";
import { test } from "node:test";
import { i16b8d55a332958f3b47989994ca5c52c as before } from "./i16b8d55a332958f3b47989994ca5c52c.ts";

const state = (meta: Record<string, unknown>) => ({ fm: { name: "ideas.briefed", meta }, body: "" });

test("a dive not yet jumped may change its feat; a jumped one keeps it", async () => {
	await before({ before: state({ feat: "a" }), after: state({ feat: "b" }) } as never);
	await before({ before: state({ feat: "a", packer: "diver@example.com" }), after: state({ feat: "a", packer: null }) } as never);
	await assert.rejects(before({ before: state({ feat: "a", packer: "diver@example.com" }), after: state({ feat: "b" }) } as never), /dive ideas\.briefed was jumped on its feat, so it keeps it/);
});

test("a dive takes no name but the one its feat gives it", async () => {
	const named = (name: string) => ({ fm: { name, meta: { feat: "a" } }, body: "" });
	await assert.rejects(before({ before: named("ideas.briefed"), after: named("my-name") } as never), /dive ideas\.briefed is named after its feat, so it takes no other name/);
	await before({ before: named("ideas.briefed"), after: named("ideas.briefed") } as never);
});

test("a dive held or packed is not dropped; one over, one never jumped, or a mint, passes", async () => {
	await assert.rejects(before({ before: state({ feat: "a", diver: "diver@example.com#0123456789ab" }) } as never), /dive ideas\.briefed is held by diver@example\.com: it is not over, so it is not dropped; land or bail it first/);
	await assert.rejects(before({ before: state({ feat: "a", diver: null, packer: "diver@example.com" }) } as never), /dive ideas\.briefed was packed by diver@example\.com, unfinished: jump it and finish it/);
	for (const outcome of ["landed", "bailed"]) await before({ before: state({ feat: "a", diver: null, packer: "diver@example.com", outcome }) } as never);
	await before({ before: state({ feat: "a" }) } as never);
	await before({ after: state({ feat: "a" }) } as never);
});

test("any edit of a held dive is refused, saying to record a turn or pack it; a packed, over or unjumped one is edited", async () => {
	const held = state({ feat: "a", diver: "diver@example.com#0123456789ab" });
	await assert.rejects(before({ before: held, after: state({ feat: "a", diver: "diver@example.com#0123456789ab" }) } as never), /dive ideas\.briefed is held by diver@example\.com, so its doc changes only through the loop: record a turn with `pass --turn` instead, or pack it first/);
	for (const meta of [{ feat: "a", diver: null, packer: "diver@example.com" }, { feat: "a", diver: "diver@example.com#0123456789ab", outcome: "landed" }, { feat: "a" }]) {
		await before({ before: state(meta), after: state(meta) } as never);
	}
});
