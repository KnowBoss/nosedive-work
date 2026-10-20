import type { ActionCall } from "nosedive-core";
import { idae870d5677552668a3496e880920f3f } from "./idae870d5677552668a3496e880920f3f.ts";

export async function i01a15bb27501731a9e9c1e41b96c3dde(call: ActionCall): Promise<void> {
	switch (call.usage) {
		case "udae870d5677552668a3496e880920f3f": // pack
			return idae870d5677552668a3496e880920f3f(call.args, call.ctx);
		default:
			throw new Error(`pack has no impl for ${call.usage}`);
	}
}
