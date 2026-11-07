import type { GateCtx } from "nosedive-core";
import { changed } from "nosedive-core";
import { isDive, keyOf, readScopes } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";

/**
 * A dive crud makes, or makes a dive, gets its feat's scopes and is linked from its feat as `dives.feat`; one whose feat crud
 * changes, which the before gate allows only before it is jumped, moves to the new feat's scopes and link.
 */
export async function i012ea2e903345c02b1cc8786221f93cd(ctx: GateCtx): Promise<void> {
	const { before, after, doc, bridge: hero } = ctx;
	if (!after) return;
	const became = !before || !isDive({ ...doc, fm: before.fm } as never);
	const moved = before !== undefined && !became && changed(before, after, "meta.feat");
	if (!became && !moved) return;
	const featId = String((after.fm.meta as { feat?: unknown } | undefined)?.feat);
	const feat = ctx.edit.doc(featId);
	const key = keyOf(hero, doc as never);

	// The feat's repos replace those the dive scoped; its other entries, as its kind's canonical one, stay.
	const wanted = readScopes(hero, feat as never);
	const patch: Record<string, unknown> = {};
	for (const { repoId } of readScopes(hero, { ...doc, fm: after.fm } as never)) if (!wanted.some((entry) => entry.repoId === repoId)) patch[repoId] = null;
	// A scope patch merges into the entry, so a branch the new feat lacks is cleared, not left.
	for (const entry of wanted) patch[entry.repoId] = { "work-branch": entry.branch ?? null };
	if (Object.keys(patch).length > 0) ctx.crud(doc.id, "scopes", patch);

	if (moved) {
		const from = String((before!.fm.meta as { feat?: unknown } | undefined)?.feat);
		ctx.crud(from, "links", { [key]: null });
	}
	ctx.crud(feat.id, "links", { [key]: { rel: "dives.feat" } });
}
