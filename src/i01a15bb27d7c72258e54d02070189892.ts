import type { GateCtx } from "nosedive-core";
import { i01a13354845c7253a55b60bba87285d8 as findKbDoc } from "nosedive-core";
import { i01a13354894273b1be253424511ba82c as commitFiles } from "nosedive-core";
import { i01a1335483aa776cb84df698b04adc06 as writeKbDoc } from "nosedive-core";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

export type Hero = GateCtx["bridge"];
export type Doc = NonNullable<ReturnType<typeof findKbDoc>>;

export type Change = {
	/** Names the commit: `jump(<dive>): <summary>`. */
	action: string;
	/** Names the section: `## <heading> <iso time>`. */
	heading: string;
	summary: string;
	/** Fields of `meta` to set; null clears one. */
	meta?: Record<string, unknown>;
	lines: string[];
	/** Other hero files the same commit carries. */
	also?: string[];
};

export function i01a15bb27d7c72258e54d02070189892(hero: Hero, doc: Doc, change: Change, ctx: { err(text: string): void }): void {
	for (const [key, value] of Object.entries(change.meta ?? {})) {
		if (value === null) doc.yaml.deleteIn(["meta", key]);
		else doc.yaml.setIn(["meta", key], value);
	}
	const meta = (doc.yaml.toJS() as { meta?: Record<string, unknown> }).meta;
	if (meta && Object.keys(meta).length === 0) doc.yaml.delete("meta");
	const body = `${doc.body.replace(/\n*$/, "\n")}\n## ${change.heading} ${new Date().toISOString()}\n\n${change.lines.join("\n")}\n`;
	writeKbDoc(doc.path, doc.yaml, body);
	doc.body = body;
	commitFiles(hero.dir, [doc.path, ...(change.also ?? [])], `${change.action}(${String(doc.fm.name)}): ${change.summary}`);
	if (!runGit(hero.dir, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}").ok) return;
	const pushed = runGit(hero.dir, "push", "-q");
	if (!pushed.ok) ctx.err(`nosedive: the hero was committed but not pushed: ${pushed.text}`);
}
