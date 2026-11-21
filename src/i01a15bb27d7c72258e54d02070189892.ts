import type { GateCtx, KbDoc } from "nosedive-core";
import { i01a13354845c7253a55b60bba87285d8 as findKbDoc } from "nosedive-core";
import { kingsmetal } from "nosedive-core";

export type Hero = GateCtx["bridge"];
export type Doc = NonNullable<ReturnType<typeof findKbDoc>>;

export type Change = {
	/** Names the commit: `<action>(<dive name>): <summary>`, the loop's command first. */
	action: string;
	/** Names the section: `## <iso time> <label>`. */
	label: string;
	summary: string;
	/** Fields of `meta` to set; null clears one. */
	meta?: Record<string, unknown>;
	/** The dive's scopes, replaced whole. */
	scopes?: unknown[];
	lines: string[];
};

/** The dive doc's new text and the commit's message for a change, as of the doc given: nothing is written, so the caller can commit it off to the side. */
export function i01a15bb27d7c72258e54d02070189892(doc: KbDoc, change: Change): { text: string; message: string } {
	for (const [key, value] of Object.entries(change.meta ?? {})) {
		if (value === null) doc.yaml.deleteIn(["meta", key]);
		else doc.yaml.setIn(["meta", key], value);
	}
	const meta = (doc.yaml.toJS() as { meta?: Record<string, unknown> }).meta;
	if (meta && Object.keys(meta).length === 0) doc.yaml.delete("meta");
	if (change.scopes) doc.yaml.set("scopes", change.scopes);
	const body = `${doc.body.replace(/\n*$/, "\n")}\n## ${new Date().toISOString()} ${change.label}\n\n${change.lines.join("\n")}\n`;
	kingsmetal(doc.yaml);
	return { text: `---\n${doc.yaml.toString({ lineWidth: 0 })}---\n${body}`, message: `${change.action}(${String(doc.fm.name)}): ${change.summary}` };
}
