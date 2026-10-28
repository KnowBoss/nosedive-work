import type { ActionCall } from "nosedive-core";
import { if8cb5f3d6de95b8ea88d25f745af7b03 } from "./if8cb5f3d6de95b8ea88d25f745af7b03.ts";

export async function i01a15bb2736b7eac84a73389e72d9590(call: ActionCall): Promise<void> {
	switch (call.usage) {
		case "uf8cb5f3d6de95b8ea88d25f745af7b03": // jump [<ref>]
			return if8cb5f3d6de95b8ea88d25f745af7b03(call.args, call.ctx);
		default:
			throw new Error(`jump has no impl for ${call.usage}`);
	}
}
