import type { GateCtx } from "nosedive-core";
import { i01a13354845c7253a55b60bba87285d8 as findKbDoc } from "nosedive-core";
import { i01a13354894273b1be253424511ba82c as commitFiles } from "nosedive-core";
import { i01a1335483aa776cb84df698b04adc06 as writeKbDoc } from "nosedive-core";
import { subjectLine } from "nosedive-core";
import { featName } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";

export type Hero = GateCtx["bridge"];
export type Doc = NonNullable<ReturnType<typeof findKbDoc>>;

export type Change = {
	/** Names the commit: `feat(<feat name>): <action> <summary>`. */
	action: string;
	/** Names the section: `## <iso time> <label>`. */
	label: string;
	summary: string;
	/** Fields of `meta` to set; null clears one. */
	meta?: Record<string, unknown>;
	/** The dive's scopes, replaced whole. */
	scopes?: unknown[];
	lines: string[];
	/** Other hero files the same commit carries. */
	also?: string[];
};

/** `version` is the core's, named in the co-author trailer of the commit. */
export function i01a15bb27d7c72258e54d02070189892(hero: Hero, doc: Doc, change: Change, version: string): void {
	for (const [key, value] of Object.entries(change.meta ?? {})) {
		if (value === null) doc.yaml.deleteIn(["meta", key]);
		else doc.yaml.setIn(["meta", key], value);
	}
	const meta = (doc.yaml.toJS() as { meta?: Record<string, unknown> }).meta;
	if (meta && Object.keys(meta).length === 0) doc.yaml.delete("meta");
	if (change.scopes) doc.yaml.set("scopes", change.scopes);
	const body = `${doc.body.replace(/\n*$/, "\n")}\n## ${new Date().toISOString()} ${change.label}\n\n${change.lines.join("\n")}\n`;
	writeKbDoc(doc.path, doc.yaml, body);
	doc.body = body;
	commitFiles(hero.dir, [doc.path, ...(change.also ?? [])], subjectLine(featName(hero, doc), change.action, change.summary), version);
}
