import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { i01a13354845c7253a55b60bba87285d8 as findKbDoc } from "nosedive-core";
import { i01a15baf13e27bd88dc880d4871f2210 as hydrateRepo } from "nosedive-core";
import { linkedIds, quiet, reachedAsFeat, readScopes, repoDoc } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27d7c72258e54d02070189892 as recordDive } from "./i01a15bb27d7c72258e54d02070189892.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

type Merge = { name: string; dir: string; trunk: string; branch: string; result: string; how: string };

export async function ic5b0c0d5fa525fcab3d57e72cd3cde83(args: Args, ctx: Ctx): Promise<void> {
	const ship = findBridge(ctx.cwd);
	if (!ship?.workspace) throw new Error("merge works in a ship, and this is not one");
	const feat = findKbDoc(ship.kbDir, String(args.feat));
	if (!feat || !reachedAsFeat(ship, String(args.feat))) throw new Error(`${String(args.feat)} is no feat in the ship's kb`);
	const open = linkedIds(feat)
		.filter(({ rel }) => rel === "dives.feat")
		.map(({ id }) => findKbDoc(ship.kbDir, id))
		.filter((doc) => doc?.fm.kind === "dive" && !(doc.fm.meta as { outcome?: unknown } | undefined)?.outcome);
	if (open.length > 0) throw new Error(`${String(feat.fm.name)} has open dives, so nothing was merged: ${open.map((doc) => String(doc!.fm.name)).join(", ")}`);

	// Each merge is made in a scratch checkout first, so a conflict anywhere pushes nothing anywhere.
	const merges: Merge[] = [];
	const scratch: { cache: string; dir: string }[] = [];
	try {
		const refused: string[] = [];
		for (const entry of readScopes(feat).filter((each) => each.branch)) {
			const repo = repoDoc(ship, entry.repoId);
			const { dir, trunk } = hydrateRepo(ship, repo, quiet(ctx));
			const name = String(repo.fm.name);
			const branch = entry.branch!;
			runGit(dir, "fetch", "-q", "--prune", "origin");
			const tip = runGit(dir, "rev-parse", "--verify", "-q", `refs/remotes/origin/${branch}`);
			if (!tip.ok) continue;
			const base = runGit(dir, "rev-parse", `refs/remotes/origin/${trunk}`).text;
			if (runGit(dir, "merge-base", "--is-ancestor", tip.text, base).ok) {
				merges.push({ name, dir, trunk, branch, result: base, how: "already in" });
			} else if (runGit(dir, "merge-base", "--is-ancestor", base, tip.text).ok) {
				merges.push({ name, dir, trunk, branch, result: tip.text, how: "fast-forwarded" });
			} else {
				const cache = runGit(dir, "rev-parse", "--path-format=absolute", "--git-common-dir").text;
				const work = mkdtempSync(join(tmpdir(), `nosedive-merge-${name}-`));
				rmSync(work, { recursive: true });
				runGit(cache, "worktree", "add", "-q", "--detach", work, base);
				scratch.push({ cache, dir: work });
				const merged = runGit(work, "merge", "-q", "--no-ff", "-m", `merge ${branch} into ${trunk}`, tip.text);
				if (!merged.ok) {
					refused.push(`${branch} conflicts with ${trunk} in ${name}: ${runGit(work, "diff", "--name-only", "--diff-filter=U").text.split("\n").join(", ")}`);
					runGit(work, "merge", "--abort");
					continue;
				}
				merges.push({ name, dir, trunk, branch, result: runGit(work, "rev-parse", "HEAD").text, how: "merged" });
			}
		}
		if (refused.length > 0) throw new Error(`nothing was merged:\n  ${refused.join("\n  ")}`);
		if (merges.length === 0) throw new Error(`${String(feat.fm.name)} has no work branch to merge`);

		const lines: string[] = [];
		for (const merge of merges) {
			const pushed = runGit(merge.dir, "push", "-q", "origin", `${merge.result}:refs/heads/${merge.trunk}`);
			if (!pushed.ok) throw new Error(`cannot push ${merge.name}'s ${merge.trunk}: ${pushed.text}`);
			runGit(merge.dir, "push", "-q", "origin", `:refs/heads/${merge.branch}`);
			lines.push(`- ${merge.name}: ${merge.branch} ${merge.how} ${merge.trunk} at ${merge.result.slice(0, 7)}`);
		}
		recordDive(ship, feat, { action: "merge", heading: "Merged", summary: `work branches merged into trunk`, lines }, ctx);
		ctx.out(`merged ${String(feat.fm.name)}\n${lines.join("\n")}`);
	} finally {
		for (const { cache, dir } of scratch) runGit(cache, "worktree", "remove", "--force", dir);
	}
}
