import type { GateCtx } from "nosedive-core";
import { changed } from "nosedive-core";

type State = NonNullable<GateCtx["before"]>;

const metaOf = (state: State) => (state.fm.meta ?? {}) as { diver?: unknown; packer?: unknown; outcome?: unknown };

/** A dive held by nobody is dropped; one that was jumped keeps the feat it was jumped on. */
export async function i16b8d55a332958f3b47989994ca5c52c(ctx: GateCtx): Promise<void> {
	const { before, after } = ctx;
	if (!before) return;
	const name = String(before.fm.name);
	const meta = metaOf(before);
	if (!after) {
		if (typeof meta.diver === "string" && meta.diver && meta.outcome === undefined) {
			throw new Error(`dive ${name} is held by ${meta.diver.split("#")[0]}: land, pack or bail it before dropping it`);
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
