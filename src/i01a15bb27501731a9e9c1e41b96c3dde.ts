import type { ActionCall } from "nosedive-core";
import { i0735c57383365d4ca5395ea24f5b0649 } from "./i0735c57383365d4ca5395ea24f5b0649.ts";

export async function i01a15bb27501731a9e9c1e41b96c3dde(call: ActionCall): Promise<void> {
	switch (call.usage) {
		case "u0735c57383365d4ca5395ea24f5b0649": // pack [<dive>]
			return i0735c57383365d4ca5395ea24f5b0649(call.args, call.ctx);
		default:
			throw new Error(`pack has no impl for ${call.usage}`);
	}
}
