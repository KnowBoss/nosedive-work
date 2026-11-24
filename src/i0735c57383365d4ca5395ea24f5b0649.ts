import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { refuseOwnScopes } from "./dive-origin.ts";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, emailOf, putDown, readOnlyRefusals, scopesWith } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";

export async function i0735c57383365d4ca5395ea24f5b0649(args: Args, ctx: Ctx): Promise<void> {
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("pack works in a hero repo, and this is not one");
	const dive = diveOnDeck(hero, ctx, typeof args.dive === "string" ? args.dive : undefined);
	refuseOwnScopes(hero, dive.doc);
	const me = emailOf(hero);
	const refused = readOnlyRefusals(dive);
	if (refused.length > 0) throw new Error(`read-only scopes hold work with nowhere to go, so nothing was packed:\n  ${refused.join("\n  ")}`);

	let lines: string[] = [];
	await putDown(dive, ctx.capes[0]!.version, "pack", ({ puts, refs, own }) => {
		lines = puts.map((put) => (put.sha ? `- ${put.name}: ${put.commits.length} commit${put.commits.length === 1 ? "" : "s"} kept on ${own} at ${put.sha.slice(0, 7)}` : `- ${put.name}: no work`));
		return { action: "pack", label: "packed", summary: `${me} put it down`, meta: { diver: null, packer: me }, scopes: scopesWith(hero, dive.doc, refs), lines: [`${me} put it down.`, "", ...lines] };
	});
	ctx.out(`packed ${String(dive.doc.fm.name)}${lines.length > 0 ? `\n${lines.join("\n")}` : ""}`);
}
