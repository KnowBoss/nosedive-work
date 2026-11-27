import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GateCtx } from "nosedive-core";
import { i01a1335482f876d6808aec457f512e80 as readKbDoc } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, backUp } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";

export async function i01a18f6b14f97ca38a091f6b31317223(ctx: GateCtx): Promise<void> {
	diveOnDeck(ctx.bridge, ctx, ctx.doc.id);
	const summary = typeof ctx.args.summary === "string" ? ctx.args.summary.trimEnd() : "";
	const next = typeof ctx.args.next === "string" ? ctx.args.next : "";
	const label = typeof ctx.args.label === "string" ? ctx.args.label : "";
	if (/[\r\n]/.test(next)) throw new Error("--next must be one line");
	if (!summary.trim() && !next.trim()) throw new Error("turn needs a summary or --next");
	const lines = [...(summary ? [summary] : []), ...(next ? [`Next: ${next}`] : [])];
	// UTC until core exports the hero-zone timestamp helper from defer-questions.
	const heading = `${new Date().toISOString()}${label ? ` ${label}` : ""}`;
	// The section goes on the doc as it is now, not as pass read it when it began, so an edit made meanwhile is carried and not replaced.
	const text = readFileSync(ctx.doc.path, "utf8");
	const current = readKbDoc(text, ctx.doc.path);
	ctx.doc.text = text;
	ctx.doc.fm = current.fm;
	ctx.doc.yaml = current.yaml;
	ctx.doc.body = `${current.body.replace(/\n*$/, "\n")}\n## ${heading}\n\n${lines.join("\n")}\n`;
	ctx.edit.change(ctx.doc);

	// The turn goes to the dive's ref, never to the home, which land, pack and bail publish it to in their record (turns-publish-when, turns-pushed-where). Said once pass has committed.
	if (!ctx.committed) return ctx.out("turn: committed on the dive branch, not pushed: this core gives gates no commit hook; pack or land pushes it");
	ctx.committed((commits) => {
		const sha = commits.find((each) => resolve(each.repoDir).toLowerCase() === resolve(ctx.bridge.dir).toLowerCase())?.sha;
		let done: ReturnType<typeof backUp>;
		try {
			done = backUp(diveOnDeck(ctx.bridge, ctx, ctx.doc.id));
		} catch (error) {
			// The turn is committed whatever the push met: a failure here is no failed turn.
			done = { pushed: [], refused: [{ name: "hero", why: (error as Error).message }], uncommitted: [] };
		}
		ctx.out(`turn: ${sha ? `${sha.slice(0, 7)} ` : ""}committed on the dive branch${done.pushed.length > 0 ? ` and pushed to its dive ref in ${done.pushed.join(", ")}` : ", not pushed"}; the home gets it only when land, pack or bail puts the dive down`);
		for (const { name, why } of done.refused) ctx.err(`warning: ${name} was not pushed to its dive ref (${why}); its committed work stays on the dive branch, and a later turn, pack or land pushes it`);
		if (done.uncommitted.length > 0) ctx.err(`warning: uncommitted changes in ${done.uncommitted.join(", ")} are not backed up: a turn pushes only what is committed`);
	});
}
