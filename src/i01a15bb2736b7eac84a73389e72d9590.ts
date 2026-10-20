import type { ActionCall } from "nosedive-core";
import { i4b0709b1f9bf587aa8452f900544321e } from "./i4b0709b1f9bf587aa8452f900544321e.ts";

export async function i01a15bb2736b7eac84a73389e72d9590(call: ActionCall): Promise<void> {
	switch (call.usage) {
		case "u4b0709b1f9bf587aa8452f900544321e": // jump <ref>
			return i4b0709b1f9bf587aa8452f900544321e(call.args, call.ctx);
		default:
			throw new Error(`jump has no impl for ${call.usage}`);
	}
}
