import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { docAt } from "nosedive-core";
import { ownScopes } from "./i01a204ebdb4a799ba8119e92b0e93cc5.ts";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, assertHeld, carry, emailOf, fetchHome, heroBranch, homeUpdate, homeUpstream, keyOf, openDives, planHome, putDown, recordOn, replanning, scopesWith, type Dive } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";

export async function iffc777778a63553ba90babcc038eb748(args: Args, ctx: Ctx): Promise<void> {
	const reason = String(args.reason ?? "").trim();
	if (!reason) throw new Error("bail needs a reason: --reason <why>");
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("bail works in a hero repo, and this is not one");
	const named = typeof args.dive === "string" ? args.dive : undefined;
	let dive: Dive | undefined;
	let missing: unknown;
	try {
		dive = diveOnDeck(hero, ctx, named);
	} catch (error) {
		missing = error;
	}
	const doc = dive?.doc ?? openDives(hero).find((each) => named !== undefined && (each.fm.id === named || each.fm.name === named));
	const me = emailOf(hero);
	const version = ctx.capes[0]!.version;

	// A dive with a scope on the hero's own origin is ended on its record alone: its refs and checkouts are left as they are (own-scope-publishes-nothing-unmerged).
	const refused = doc ? ownScopes(hero, doc) : [];
	if (doc && refused.length > 0) {
		await replanning(() => {
			const home = dive?.home ?? heroBranch(hero);
			const up = homeUpstream(hero, home);
			const plan = planHome(hero, home, up, fetchHome(hero, up));
			const rel = keyOf(hero, doc);
			const there = docAt(hero.dir, plan.tip, rel);
			if (dive) assertHeld(hero, dive, plan.tip);
			else if (!there || (there.fm.meta as { outcome?: unknown } | undefined)?.outcome) throw new Error(`dive ${String(doc.fm.name)} is not open on ${home}, so nothing was changed`);
			const made = recordOn(hero, plan.tip, rel, { action: "bail", label: "bailed", summary: reason, meta: { diver: null, packer: null, outcome: "bailed" }, scopes: scopesWith(hero, doc, new Map()), lines: [`${me} bailed: ${reason}`, "", ...refused.map((line) => `- ${line}`)] }, version);
			const local = { moves: [{ ref: `refs/heads/${home}`, old: plan.old, new: made.tip }], ...(dive ? {} : { files: { from: plan.old, to: made.tip } }) };
			carry({ steps: [{ repo: "hero", dir: hero.dir, remote: { name: up.remote, updates: [homeUpdate(plan, made.tip, [made.tip])] }, local }] }, "bail");
		});
		ctx.out(`bailed ${String(doc.fm.name)}, leaving its refs and checkouts as they were${dive ? `: switch the hero to ${dive.home} and delete ${dive.branch} by hand` : ""}`);
		return;
	}
	if (!dive) throw missing;

	await putDown(dive, version, "bail", ({ puts, refs, own }) => {
		const lines = [`${me} bailed: ${reason}`, "", ...puts.map((put) => `- ${put.name}: ${put.sha ? `held ${[...put.commits].reverse().join("; ")}, kept on ${own}` : "held no commits"}`)];
		return { action: "bail", label: "bailed", summary: reason, meta: { diver: null, outcome: "bailed" }, scopes: scopesWith(hero, dive.doc, refs), lines };
	});
	ctx.out(`bailed ${String(dive.doc.fm.name)}`);
}
