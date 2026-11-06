import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, emailOf, heroDoc, pushRecord, putDown, scopesWith } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27d7c72258e54d02070189892 as recordDive } from "./i01a15bb27d7c72258e54d02070189892.ts";

export async function iffc777778a63553ba90babcc038eb748(args: Args, ctx: Ctx): Promise<void> {
	const reason = String(args.reason ?? "").trim();
	if (!reason) throw new Error("bail needs a reason: --reason <why>");
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("bail works in a hero repo, and this is not one");
	const dive = diveOnDeck(hero, ctx, typeof args.dive === "string" ? args.dive : undefined);
	const me = emailOf(hero);

	const { puts, refs, own } = putDown(dive, ctx.capes[0]!.version);
	const lines = [`${me} bailed: ${reason}`, "", ...puts.map((put) => `- ${put.name}: ${put.sha ? `held ${[...put.commits].reverse().join("; ")}, kept on ${own}` : "held no commits"}`)];
	const id = String(dive.doc.fm.id);
	pushRecord(hero, () => {
		const doc = heroDoc(hero, id)!;
		recordDive(hero, doc, { action: "bail", label: "bailed", summary: reason, meta: { diver: null, outcome: "bailed" }, scopes: scopesWith(hero, doc, refs), lines }, ctx.capes[0]!.version);
	});
	ctx.out(`bailed ${String(dive.doc.fm.name)}`);
}
