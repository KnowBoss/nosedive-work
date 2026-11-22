import { relative } from "node:path";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { coAuthor, fetchExact, replay, stampRange } from "nosedive-core";
import type { LocalStep, RemoteUpdate, Sha, Step } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, assertHeld, carry, diveRefs, heroRef, durableFeat, emailOf, featOf, fetchHome, heroDoc, homeUpdate, homeUpstream, keyOf, localDiveRefs, packIgnored, planHome, readOnlyRefusals, recordOn, replanning, scopesWith } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

export async function i2bcf8d7ee2645df5b261ee1b2135d190(args: Args, ctx: Ctx): Promise<void> {
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("land works in a hero repo, and this is not one");
	const dive = diveOnDeck(hero, ctx, typeof args.dive === "string" ? args.dive : undefined);
	const me = emailOf(hero);
	const id = String(dive.doc.fm.id);
	const writable = dive.scopes.filter((scope) => scope.branch && scope.ours);
	const version = ctx.capes[0]!.version;

	const lines = await replanning(() => {
		// Every refusal is found before anything is pushed, and so is every conflict.
		const refused = readOnlyRefusals(dive);
		if (runGit(hero.dir, "status", "--porcelain").text) refused.push("the hero has uncommitted changes: commit them first");
		// The hero's work goes home, the branch the dive was jumped from, which must be its upstream's (records-on-jumped-branch).
		const { home } = dive;
		const up = homeUpstream(hero, home);
		let homeTip = "";
		try {
			const upstream = fetchHome(hero, up);
			homeTip = upstream;
		} catch (error) {
			refused.push((error as Error).message);
		}
		const found = new Map<string, Sha | null>();
		for (const scope of writable) {
			const shown = relative(hero.dir, scope.dir).replace(/\\/g, "/");
			if (runGit(scope.dir, "status", "--porcelain").text) refused.push(`${shown} has uncommitted changes: commit them first`);
			// Exact: what the work branch holds now, which the push is leased on and the stamps start from.
			let work: Sha | null = null;
			try {
				work = fetchExact(scope.dir, "origin", [`refs/heads/${scope.branch}`])[`refs/heads/${scope.branch}`] ?? null;
			} catch (error) {
				refused.push((error as Error).message);
			}
			found.set(scope.repoId, work);
			if (work && !runGit(scope.dir, "merge-base", "--is-ancestor", work, "HEAD").ok) {
				refused.push(`${scope.branch} in ${scope.name} has moved to ${work.slice(0, 7)}, which this dive's work does not contain: pack, then jump ${id}, which rebases the work onto it`);
			}
		}
		// The home's commits nosedive made go first, replayed, so the dive's hero work is replayed onto what is published.
		let homePlan: ReturnType<typeof planHome> | undefined;
		if (homeTip) {
			try {
				homePlan = planHome(hero, home, up, homeTip);
			} catch (error) {
				refused.push((error as Error).message);
			}
		}
		if (refused.length > 0 || !homePlan) throw new Error(`nothing was landed:\n  ${refused.join("\n  ")}`);
		// Written down before the record is pushed, so a retry can tell a record this land published from anyone else's.
		const markerRef = `refs/nosedive-landed/${hero.id}/${id}`;
		const marker = runGit(hero.dir, "rev-parse", "--verify", "-q", markerRef).text || undefined;
		const already = marker !== undefined && homePlan.tip === marker;
		assertHeld(hero, dive, homePlan.tip, marker);

		const trailers = [`Nosedive-Dive: ${id}`, `Nosedive-Feat: ${durableFeat(hero, dive.doc, ctx.capes)}`, coAuthor(version)];
		const notes: string[] = [];
		const steps: Step[] = [];
		const after: LocalStep[] = [];
		const branch = `refs/heads/${dive.branch}`;
		for (const scope of writable) {
			const work = found.get(scope.repoId) ?? null;
			const trunk = work ? null : fetchExact(scope.dir, "origin", [`refs/heads/${scope.trunk}`])[`refs/heads/${scope.trunk}`] ?? null;
			const base = work ?? trunk;
			const head = runGit(scope.dir, "rev-parse", "HEAD").text;
			const seen = diveRefs(scope.dir, id);
			const sourceRef = `refs/nosedive-source/${hero.id}/${id}/${scope.repoId}`;
			// What this checkout held before it stamped, written down so a retry still knows the unstamped tips it may delete.
			const source = runGit(scope.dir, "rev-parse", "--verify", "-q", sourceRef).text;
			const kept = (sha: Sha) => sha === scope.ref || (source !== "" && runGit(scope.dir, "merge-base", "--is-ancestor", sha, source).ok) || (scope.ref !== undefined && runGit(scope.dir, "merge-base", "--is-ancestor", sha, scope.ref).ok) || runGit(scope.dir, "merge-base", "--is-ancestor", sha, head).ok;
			const lost = seen.filter(({ sha }) => !kept(sha));
			if (lost.length > 0) throw new Error(`nothing was landed: ${scope.name}: ${lost.map(({ ref, sha }) => `${ref} is at ${sha.slice(0, 7)}`).join(", ")}, work this dive did not see and the landed work does not hold: jump the dive to take it in, or delete the ref by hand`);
			const stampedHead = base && runGit(scope.dir, "rev-list", "--count", `${base}..${head}`).text === "0" ? undefined : stampRange(scope.dir, base, head, trailers);
			const updates: RemoteUpdate[] = [];
			if (stampedHead) {
				updates.push({ ref: `refs/heads/${scope.branch}`, old: work, new: stampedHead.tip, fastForward: true, publishes: stampedHead.made });
				notes.push(`- ${scope.name}: pushed ${stampedHead.tip.slice(0, 7)} to ${scope.branch}`);
			} else notes.push(`- ${scope.name}: unchanged`);
			for (const { ref, sha } of seen) updates.push({ ref, old: sha, new: null, fastForward: false });
			const tip = stampedHead?.tip ?? head;
			// The branch moves to the stamped commits before anything is pushed, so a retry finds its own published tip at HEAD.
			if (tip !== head) steps.push({ repo: scope.name, dir: scope.dir, local: { moves: [{ ref: branch, old: head, new: tip }, { ref: sourceRef, old: source || null, new: source || head }] } });
			const moves = [
				...localDiveRefs(scope.dir, id).map(({ ref, sha }) => ({ ref, old: sha, new: null })),
			];
			steps.push({ repo: scope.name, dir: scope.dir, ...(updates.length > 0 ? { remote: { name: "origin", updates } } : {}), local: { moves } });
			// Left where it landed, its branch gone: the work branch holds it now.
			after.push({ repo: scope.name, dir: scope.dir, local: { head: { from: { branch: dive.branch }, to: { detached: tip } }, drop: [{ ref: branch, old: tip, new: null }, ...(tip !== head || source ? [{ ref: sourceRef, old: source || head, new: null }] : [])] } });
		}

		// The hero's own work, replayed onto the home as it is to be published, then stamped; a conflict is met here, before any scope is pushed.
		const d0 = runGit(hero.dir, "rev-parse", "HEAD").text;
		const work = runGit(hero.dir, "rev-list", "--reverse", "--topo-order", d0, "--not", `refs/heads/${home}`).text.split("\n").filter(Boolean);
		const set = new Set<Sha>();
		let heroTip: Sha = homePlan.tip;
		// A retry of a record this land already published has nothing left to replay or record.
		if (!already && work.length > 0) {
			const replayed = replay(hero.dir, work, homePlan.tip);
			if ("conflict" in replayed) throw new Error(`the hero's work conflicts with ${home}, so nothing was landed: rebase ${dive.branch} onto ${home}, then land ${id} again\n${replayed.conflict}`);
			for (const sha of replayed.made) set.add(sha);
			const stamped = stampRange(hero.dir, homePlan.tip, replayed.tip, trailers);
			for (const sha of stamped.made) set.add(sha);
			heroTip = stamped.tip;
			const count = runGit(hero.dir, "rev-list", "--count", `${homePlan.tip}..${heroTip}`).text;
			if (count !== "0") notes.push(`- hero: ${count} commit${count === "1" ? "" : "s"} onto ${home}`);
		}

		// Home, its work on it between the jump record and the land record, the dive branch gone (loop-returns-home).
		const cleared = new Map<string, string | undefined>([...dive.scopes.map((scope): [string, undefined] => [scope.repoId, undefined]), [hero.id!, undefined]]);
		const doc = heroDoc(hero, id)!;
		const made = already ? { tip: marker! } : recordOn(hero, heroTip, keyOf(hero, doc), { action: "land", label: "landed", summary: `${me} landed it`, meta: { diver: null, outcome: "landed" }, scopes: scopesWith(hero, doc, cleared), lines: [`${me} landed it.`, "", ...notes] }, version);
		const heroSeen = diveRefs(hero.dir, id);
		const recorded = heroRef(hero, dive.doc);
		const lostHero = heroSeen.filter(({ sha }) => !(sha === recorded || (recorded !== undefined && runGit(hero.dir, "merge-base", "--is-ancestor", sha, recorded).ok) || runGit(hero.dir, "merge-base", "--is-ancestor", sha, d0).ok));
		if (lostHero.length > 0) throw new Error(`nothing was landed: hero: ${lostHero.map(({ ref, sha }) => `${ref} is at ${sha.slice(0, 7)}`).join(", ")}, work this dive did not see and the landed work does not hold: jump the dive to take it in, or delete the ref by hand`);
		if (!already) steps.push({ repo: "hero", dir: hero.dir, local: { moves: [{ ref: markerRef, old: marker ?? null, new: made.tip }] } });
		steps.push({
			repo: "hero",
			dir: hero.dir,
			remote: { name: up.remote, updates: [...(already ? [] : [homeUpdate(homePlan, made.tip, [...set, made.tip])]), ...heroSeen.map(({ ref, sha }): RemoteUpdate => ({ ref, old: sha, new: null, fastForward: false }))] },
			local: {
				moves: [
					{ ref: `refs/heads/${home}`, old: homePlan.old, new: made.tip },
					...localDiveRefs(hero.dir, id).map(({ ref, sha }) => ({ ref, old: sha, new: null })),
				],
				head: { from: { branch: dive.branch }, to: { branch: home } },
				files: { from: d0, to: made.tip },
				drop: [{ ref: branch, old: d0, new: null }],
			},
		});
		// The marker goes only once everything else is done; it is not verified up front, since an earlier step writes it.
		after.push({ repo: "hero", dir: hero.dir, local: { drop: [{ ref: markerRef, old: made.tip, new: null }] } });
		carry({ steps, after }, "land");
		return notes;
	});

	const featId = featOf(dive.doc);
	for (const scope of dive.scopes.filter((each) => each.ours)) packIgnored(hero, featId, scope);
	ctx.out(`landed ${String(dive.doc.fm.name)}${lines.length > 0 ? `\n${lines.join("\n")}` : ""}`);
}
