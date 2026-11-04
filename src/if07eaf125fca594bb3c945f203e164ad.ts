import type { Args, Ctx } from "nosedive-core";
import { if8cb5f3d6de95b8ea88d25f745af7b03 as jump } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";

/** jump [<ref>] --from <branch>: jump, with the hero's local branch as the dive's base in place of trunk. */
export async function if07eaf125fca594bb3c945f203e164ad(args: Args, ctx: Ctx): Promise<void> {
	return jump(args, ctx);
}
