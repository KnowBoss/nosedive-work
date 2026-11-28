import { relative } from "node:path";
import type { Args, Ctx } from "nosedive-core";
import { i01a1335485c67c95b7efdf2f0e03cfd6 as findBridge } from "nosedive-core";
import { coAuthor, commitOffside, docAt, fetchExact, replay, stampRange } from "nosedive-core";
import type { LocalStep, RemoteUpdate, Sha, Step } from "nosedive-core";
import { i01a15bb27be9786f91885a2f0a0fa08e as diveOnDeck, assertHeld, assertHomeUnmoved, carry, diveRefs, heroRef, durableFeat, emailOf, featOf, fetchHome, heroDoc, homeUpdate, homeUpstream, isMarkerRef, isOldRef, keyOf, localDiveRefs, ownedRef, packIgnored, planHome, readOnlyRefusals, recordBase, recordOn, diveMarkers, diveWork, fetchAll, remoteSha, replanning, scopesWith, turnCommits } from "./i01a15bb27be9786f91885a2f0a0fa08e.ts";
import { i01a15bb27f1471549b097c2e37805132 as runGit } from "./i01a15bb27f1471549b097c2e37805132.ts";

export async function i2bcf8d7ee2645df5b261ee1b2135d190(args: Args, ctx: Ctx): Promise<void> {
	const hero = findBridge(ctx.cwd);
	if (!hero?.workspace) throw new Error("land works in a hero repo, and this is not one");
	// The hero's tip before the dive is read: the doc, scopes and gates come from it, so the run must still be there when it plans.
	const heroStart = runGit(hero.dir, "rev-parse", "HEAD").text;
	const dive = diveOnDeck(hero, ctx, typeof args.dive === "string" ? args.dive : undefined);
	const me = emailOf(hero);
	const id = String(dive.doc.fm.id);
	const writable = dive.scopes.filter((scope) => scope.branch && scope.ours);
	const version = ctx.capes[0]!.version;

	// Every push of this run is pinned to the commits it planned: a checkout that gained commits since is not planned again, it stops.
	const pinned = new Map<string, Set<string>>();
	const pin = (dir: string, head: string, planned: string[]) => {
		const known = pinned.get(dir);
		if (known && !known.has(head)) throw new Error(`${dir} gained commits while this run was publishing, so it stopped: run land again to land them`);
		const set = known ?? new Set<string>();
		set.add(head);
		for (const sha of planned) set.add(sha);
		pinned.set(dir, set);
	};
	// Every checkout's tip, taken once as this invocation found it: it is what the gates, the comparison with the failed run and the plan all
	// work from, so a commit made after it is never published by this run, whatever it passes or skips.
	const snapshot = new Map<string, string>();
	for (const dir of [hero.dir, ...dive.scopes.filter((scope) => scope.ours).map((scope) => scope.dir)]) {
		const head = dir === hero.dir ? heroStart : runGit(dir, "rev-parse", "HEAD").text;
		snapshot.set(dir, head);
		pinned.set(dir, new Set([head]));
	}
	const checkTips = () => {
		for (const dir of snapshot.keys()) pin(dir, runGit(dir, "rev-parse", "HEAD").text, []);
	};
	// A commit between reading the dive and taking the tips is refused here, not published under the older read.
	checkTips();
	const lines = await replanning(() => {
		checkTips();
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
			try {
				fetchAll(scope.dir);
			} catch (error) {
				refused.push((error as Error).message);
			}
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
		// The markers of this land are refs under the holder's token on origin, each pushed on its own before the update it guards,
		// so a rerun from any checkout reads them (nosedive-ref-scheme): the record before it is pushed tells a record this land
		// published from anyone else's, and the tips each repo held and published tell a retry which commits are its own.
		const markerOf = (slug: string) => ownedRef(dive.token, `land.${id}.${slug}`);
		const markerRef = markerOf("record");
		const marker = remoteSha(hero.dir, markerRef) ?? undefined;
		const scopeMarkers = (scope: { repoId: string }) => ({ source: markerOf(`${scope.repoId}.source`), landed: markerOf(`${scope.repoId}.tip`) });
		// The record this land wrote down is on the published home, though others may have pushed on top of it.
		const already = marker !== undefined && runGit(hero.dir, "merge-base", "--is-ancestor", marker, homePlan.upstream).ok;
		assertHeld(hero, dive, homePlan.tip, already ? homePlan.tip : undefined);
		// The record goes on the dive branch's copy of the dive doc, which holds every turn; a rerun's record is on the home already.
		// The scope work a failed run published, as the work branch shows it: its stamped tip, written down before the push, is the branch's.
		const earlier = () => {
			const published = writable.flatMap((scope) => {
				const tip = remoteSha(scope.dir, scopeMarkers(scope).landed) ?? "";
				const source = remoteSha(scope.dir, scopeMarkers(scope).source) ?? "";
				return tip !== "" && tip !== source && found.get(scope.repoId) === tip ? [`${scope.name} ${scope.branch} at ${tip.slice(0, 7)}`] : [];
			});
			return published.length > 0 ? { published, unpublished: [`the hero's work and the land record on ${home}`], rerun: "land" } : undefined;
		};
		const onBranch = already ? undefined : recordBase(hero, dive, homePlan.tip, heroStart, "land", earlier);

		const trailers = [`Nosedive-Dive: ${id}`, `Nosedive-Feat: ${durableFeat(hero, dive.doc, ctx.capes)}`, coAuthor(version)];
		const notes: string[] = [];
		// What a rerun lands that the failed run had not published.
		const later: string[] = [];
		const steps: Step[] = [];
		const after: LocalStep[] = [];
		const branch = `refs/heads/${dive.branch}`;
		const scopeCleanup: { name: string; dir: string; markers: Map<string, Sha> }[] = [];
		for (const scope of writable) {
			const work = found.get(scope.repoId) ?? null;
			const trunk = work ? null : fetchExact(scope.dir, "origin", [`refs/heads/${scope.trunk}`])[`refs/heads/${scope.trunk}`] ?? null;
			const base = work ?? trunk;
			const head = runGit(scope.dir, "rev-parse", "HEAD").text;
			const seen = diveRefs(scope.dir, id);
			const { source: sourceRef, landed: landedRef } = scopeMarkers(scope);
			// What this checkout held before it stamped, written down so a retry still knows the unstamped tips it may delete.
			const source = remoteSha(scope.dir, sourceRef) ?? "";
			// The tip this land published, written down before it pushed: in recovery it is the only thing the dive's refs may be judged against.
			const landedTip = remoteSha(scope.dir, landedRef) ?? "";
			const kept = (sha: Sha) => sha === scope.ref || (landedTip !== "" && runGit(scope.dir, "merge-base", "--is-ancestor", sha, landedTip).ok) || (source !== "" && runGit(scope.dir, "merge-base", "--is-ancestor", sha, source).ok) || (scope.ref !== undefined && runGit(scope.dir, "merge-base", "--is-ancestor", sha, scope.ref).ok) || runGit(scope.dir, "merge-base", "--is-ancestor", sha, head).ok;
			const lost = seen.filter(({ ref, sha }) => isOldRef(ref, id) && !kept(sha));
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
			pin(scope.dir, head, [tip]);
			if (landedTip !== "") later.push(...runGit(scope.dir, "log", "--reverse", "--format=%h %s", `${landedTip}..${head}`).text.split("\n").filter(Boolean).map((line) => `  ${scope.name}: ${line}`));
			const marks: RemoteUpdate[] = [];
			if (source === "") marks.push({ ref: sourceRef, old: null, new: head, fastForward: false, publishes: diveWork(scope.dir, head, null) });
			if (landedTip !== tip) marks.push({ ref: landedRef, old: landedTip || null, new: tip, fastForward: false, publishes: diveWork(scope.dir, tip, landedTip || null) });
			steps.push({ repo: scope.name, dir: scope.dir, ...(marks.length > 0 ? { remote: { name: "origin", updates: marks } } : {}), local: { moves: tip !== head ? [{ ref: branch, old: head, new: tip }] : [] } });
			// Every marker of the dive in this repo goes once the record is on the home, the ones this land has just pushed with them.
			const gone = new Map(diveMarkers(scope.dir, id).map(({ ref, sha }) => [ref, sha]));
			gone.set(sourceRef, source || head);
			gone.set(landedRef, tip);
			scopeCleanup.push({ name: scope.name, dir: scope.dir, markers: gone });
			const moves = [
				...localDiveRefs(scope.dir, id).map(({ ref, sha }) => ({ ref, old: sha, new: null })),
			];
			steps.push({ repo: scope.name, dir: scope.dir, ...(updates.length > 0 ? { remote: { name: "origin", updates } } : {}), local: { moves } });
			// Left where it landed, its branch gone: the work branch holds it now.
			after.push({ repo: scope.name, dir: scope.dir, local: { head: { from: { branch: dive.branch }, to: { detached: tip } }, drop: [{ ref: branch, old: tip, new: null }] } });
		}

		// The hero's own work, replayed onto the home as it is to be published, then stamped; a conflict is met here, before any scope is pushed.
		const heroSrcRef = markerOf("base");
		const heroSrc = remoteSha(hero.dir, heroSrcRef) ?? "";
		const heroSrcAtPlan = heroSrc;
		const d0 = runGit(hero.dir, "rev-parse", "HEAD").text;
		const since = already && heroSrcAtPlan !== "" ? heroSrcAtPlan : `refs/heads/${home}`;
		// Turns are left out of the replay: the record holds them (turns-publish-when).
		const turns = new Set(turnCommits(hero, dive.doc, since, d0));
		const work = runGit(hero.dir, "rev-list", "--reverse", "--topo-order", d0, "--not", since).text.split("\n").filter((sha) => sha && !turns.has(sha));
		const set = new Set<Sha>();
		let heroTip: Sha = homePlan.tip;
		// A rerun replays the dive as it is now: what the failed run landed is already on the home, so it replays to nothing.
		if (work.length > 0) {
			const replayed = replay(hero.dir, work, homePlan.tip);
			if ("conflict" in replayed) throw new Error(`the hero's work conflicts with ${home}, so nothing was landed: rebase ${dive.branch} onto ${home}, then land ${id} again\n${replayed.conflict}`);
			for (const sha of replayed.made) set.add(sha);
			const stamped = stampRange(hero.dir, homePlan.tip, replayed.tip, trailers);
			for (const sha of stamped.made) set.add(sha);
			heroTip = stamped.tip;
			const count = runGit(hero.dir, "rev-list", "--count", `${homePlan.tip}..${heroTip}`).text;
			if (count !== "0") notes.push(`- hero: ${count} commit${count === "1" ? "" : "s"} onto ${home}`);
		}
		const rel = keyOf(hero, dive.doc);
		if (onBranch && onBranch.turns > 0) notes.push(`- turns: ${onBranch.turns}`);
		// A rerun's record is on the home: the turns written after the failed run are appended to its copy of the dive doc.
		if (already) {
			let text = docAt(hero.dir, heroTip, rel)?.text;
			let appended = 0;
			for (const sha of turns) {
				const turned = docAt(hero.dir, sha, rel)?.text;
				const before = docAt(hero.dir, `${sha}^`, rel)?.text.trimEnd();
				if (text === undefined || turned === undefined || before === undefined || !turned.startsWith(before)) continue;
				const piece = turned.slice(before.length);
				if (text.includes(piece.trim())) continue;
				text = `${text.trimEnd()}${piece}`;
				appended++;
			}
			if (appended > 0 && text !== undefined) {
				const late = commitOffside(hero.dir, heroTip, { [rel]: text }, `land(${String(dive.doc.fm.name)}): turns written after the failed land`, version);
				for (const sha of late.made) set.add(sha);
				heroTip = late.tip;
				notes.push(`- turns written after the failed land: ${appended}`);
			}
		}

		// Home, its work on it between the jump record and the land record, the dive branch gone (loop-returns-home).
		const cleared = new Map<string, string | undefined>([...dive.scopes.map((scope): [string, undefined] => [scope.repoId, undefined]), [hero.id!, undefined]]);
		const doc = heroDoc(hero, id)!;
		const made = already ? { tip: heroTip } : recordOn(hero, heroTip, rel, { action: "land", label: "landed", summary: `${me} landed it`, meta: { diver: null, outcome: "landed" }, scopes: scopesWith(hero, doc, cleared), lines: [`${me} landed it.`, "", ...notes] }, version, { base: onBranch!.doc });
		const heroSeen = diveRefs(hero.dir, id);
		const recorded = heroRef(hero, dive.doc);
		// What the dive branch held when this land first ran; in recovery the dive's refs are judged against it, not against what the branch holds now.
		pin(hero.dir, d0, []);
		if (heroSrc !== "") later.push(...runGit(hero.dir, "log", "--reverse", "--format=%H %h %s", `${heroSrc}..${d0}`).text.split("\n").filter((line) => line && !turns.has(line.split(" ")[0]!)).map((line) => `  hero: ${line.slice(line.indexOf(" ") + 1)}`));
		const lostHero = heroSeen.filter(({ ref, sha }) => isOldRef(ref, id) && !(sha === recorded || (recorded !== undefined && runGit(hero.dir, "merge-base", "--is-ancestor", sha, recorded).ok) || runGit(hero.dir, "merge-base", "--is-ancestor", sha, d0).ok || (heroSrc !== "" && runGit(hero.dir, "merge-base", "--is-ancestor", sha, heroSrc).ok)));
		if (lostHero.length > 0) throw new Error(`nothing was landed: hero: ${lostHero.map(({ ref, sha }) => `${ref} is at ${sha.slice(0, 7)}`).join(", ")}, work this dive did not see and the landed work does not hold: jump the dive to take it in, or delete the ref by hand`);
		// Each marker is pushed on its own before the update it guards: the record and the dive branch's tip it was built from.
		if (!already) steps.push({ repo: "hero", dir: hero.dir, remote: { name: up.remote, updates: [{ ref: markerRef, old: marker ?? null, new: made.tip, fastForward: false, publishes: diveWork(hero.dir, made.tip, marker ?? null) }, ...(heroSrc === "" ? [{ ref: heroSrcRef, old: null, new: d0, fastForward: false, publishes: diveWork(hero.dir, d0, null) }] : [])] } });
		const heroMarkers = new Map(diveMarkers(hero.dir, id).map(({ ref, sha }) => [ref, sha] as [string, Sha]));
		heroMarkers.set(markerRef, already ? marker! : made.tip);
		if (heroSrc !== "" || !already) heroMarkers.set(heroSrcRef, heroSrc || d0);
		steps.push({
			repo: "hero",
			dir: hero.dir,
			remote: { name: up.remote, updates: [...(already && heroTip === homePlan.tip ? [] : [homeUpdate(homePlan, made.tip, [...set, ...(already ? [] : [made.tip])])]), ...heroSeen.map(({ ref, sha }): RemoteUpdate => ({ ref, old: sha, new: null, fastForward: false })), ...[...heroMarkers].map(([ref, sha]): RemoteUpdate => ({ ref, old: sha, new: null, fastForward: false }))] },
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
		// The scopes' markers go last, once the record is on the home; one that is left is equal to what was published, so a rerun counts it done.
		for (const { name, dir, markers } of scopeCleanup) steps.push({ repo: name, dir, remote: { name: "origin", updates: [...markers].map(([ref, sha]): RemoteUpdate => ({ ref, old: sha, new: null, fastForward: false })) } });
		if (later.length > 0) notes.push("- commits the failed land had not published, landed now:", ...later);
		assertHomeUnmoved(hero, up, homePlan.upstream);
		carry({ steps, after }, "land");
		return notes;
	});

	const featId = featOf(dive.doc);
	for (const scope of dive.scopes.filter((each) => each.ours)) packIgnored(hero, featId, scope);
	ctx.out(`landed ${String(dive.doc.fm.name)}${lines.length > 0 ? `\n${lines.join("\n")}` : ""}`);
}
