import type { ActionCall } from "nosedive-core";
import { i04e4ffac39275048813909fc5fd2e202 } from "./i04e4ffac39275048813909fc5fd2e202.ts";

export async function i01a15bb2786d79589f53bf95a2f06ff0(call: ActionCall): Promise<void> {
	switch (call.usage) {
		case "u04e4ffac39275048813909fc5fd2e202": // land
			return i04e4ffac39275048813909fc5fd2e202(call.args, call.ctx);
		default:
			throw new Error(`land has no impl for ${call.usage}`);
	}
}
