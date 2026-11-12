import type { GateCtx } from "nosedive-core";
import { changed } from "nosedive-core";

type State = NonNullable<GateCtx["before"]>;

const metaOf = (state: State) => (state.fm.meta ?? {}) as { diver?: unknown; packer?: unknown; outcome?: unknown };

/** A dive is dropped once it is over, landed or bailed, or never jumped (drops-recorded); one that was jumped keeps the feat it was jumped on. */
export async function i16b8d55a332958f3b47989994ca5c52c(ctx: GateCtx): Promise<void> {
	const { before, after } = ctx;
	if (!before) return;
	const name = String(before.fm.name);
	const meta = metaOf(before);
	// A held dive's doc changes only through turn, pack, land and bail, none of which runs crud's gates (held-dive-doc-edits).
	if (after && typeof meta.diver === "string" && meta.diver && meta.outcome === undefined) {
		throw new Error(`dive ${name} is held by ${meta.diver.split("#")[0]}, so its doc changes only through the loop: record a turn with \`pass --turn\` instead, or pack it first`);
	}
	if (!after) {
		if (meta.outcome !== undefined) return;
		if (typeof meta.diver === "string" && meta.diver) {
			throw new Error(`dive ${name} is held by ${meta.diver.split("#")[0]}: it is not over, so it is not dropped; land or bail it first`);
		}
		if (typeof meta.packer === "string" && meta.packer) {
			throw new Error(`dive ${name} was packed by ${meta.packer}, unfinished: jump it and finish it, landing or bailing it, then drop it`);
		}
		return;
	}
	// Its feat names it (dive-names-derived); moving it to another feat renames it.
	if (after.fm.name !== before.fm.name) throw new Error(`dive ${name} is named after its feat, so it takes no other name: its gist says what it is for`);
	const jumped = Boolean(meta.diver || meta.packer || meta.outcome);
	if (jumped && changed(before, after, "meta.feat")) {
		throw new Error(`dive ${name} was jumped on its feat, so it keeps it: bail it, and mint a dive on the other feat`);
	}
}
