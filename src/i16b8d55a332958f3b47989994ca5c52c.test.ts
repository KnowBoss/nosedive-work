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

test("a dive someone holds is not dropped; one put down, or a mint, passes", async () => {
	await assert.rejects(before({ before: state({ feat: "a", diver: "diver@example.com#0123456789ab" }) } as never), /dive ideas\.briefed is held by diver@example\.com: land, pack or bail it/);
	await before({ before: state({ feat: "a", diver: null, packer: "diver@example.com" }) } as never);
	await before({ after: state({ feat: "a" }) } as never);
});
