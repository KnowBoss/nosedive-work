import type { ActionCall } from "nosedive-core";
import { ic5b0c0d5fa525fcab3d57e72cd3cde83 } from "./ic5b0c0d5fa525fcab3d57e72cd3cde83.ts";

export async function i01a15bb27a027ed79f81f0ffe17df241(call: ActionCall): Promise<void> {
	switch (call.usage) {
		case "uc5b0c0d5fa525fcab3d57e72cd3cde83": // merge <feat>
			return ic5b0c0d5fa525fcab3d57e72cd3cde83(call.args, call.ctx);
		default:
			throw new Error(`merge has no impl for ${call.usage}`);
	}
}
