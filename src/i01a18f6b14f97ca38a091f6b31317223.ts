import type { GateCtx } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";

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
	ctx.doc.body = `${ctx.doc.body.replace(/\n*$/, "\n")}\n## ${heading}\n\n${lines.join("\n")}\n`;
	ctx.edit.change(ctx.doc);
}
