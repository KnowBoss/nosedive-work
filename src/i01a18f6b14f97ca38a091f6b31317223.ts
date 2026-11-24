import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GateCtx } from "nosedive-core";
import { i01a1335482f876d6808aec457f512e80 as readKbDoc } from "nosedive-core";
import { refuseOwnScopes } from "./i01a204ebdb4a799ba8119e92b0e93cc5.ts";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, putTurnOnHome, type TurnOutcome } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";

export async function i01a18f6b14f97ca38a091f6b31317223(ctx: GateCtx): Promise<void> {
	const { doc, home } = diveOnDeck(ctx.bridge, ctx, ctx.doc.id);
	refuseOwnScopes(ctx.bridge, doc);
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

	// Once pass has committed, its commit goes on the home too. The turn is recorded either way, so what fails to reach the home warns, and exits 0.
	if (!ctx.committed) {
		ctx.err(`warning: this nosedive cannot put the turn on ${home}, so it is on the dive branch only: update nosedive core`);
		return;
	}
	ctx.committed((commits) => {
		const commit = commits.find((each) => resolve(each.repoDir).toLowerCase() === resolve(ctx.bridge.dir).toLowerCase());
		let outcome: TurnOutcome;
		try {
			outcome = commit ? putTurnOnHome(ctx.bridge, home, commit.sha) : { kind: "dive-branch-only" as const, why: "pass made no commit in the hero" };
		} catch (error) {
			outcome = { kind: "dive-branch-only" as const, why: error instanceof Error ? error.message : String(error) };
		}
		if (outcome.kind === "pushed") ctx.out(`turn: ${outcome.sha} on ${home}, pushed to ${outcome.to}`);
		else if (outcome.kind === "unpushed") ctx.err(`warning: the turn is on ${home} but not pushed to ${outcome.to}: ${outcome.why}; the next turn, pack or land pushes it`);
		else ctx.err(`warning: the turn is on the dive branch only: ${outcome.why}; land carries it`);
	});
}
