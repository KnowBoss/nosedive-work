import type { ActionCall } from "nosedive-core";
import { i2bcf8d7ee2645df5b261ee1b2135d190 } from "./i2bcf8d7ee2645df5b261ee1b2135d190.ts";

export async function i01a15bb2786d79589f53bf95a2f06ff0(call: ActionCall): Promise<void> {
	switch (call.usage) {
		case "u2bcf8d7ee2645df5b261ee1b2135d190": // land [<dive>]
			return i2bcf8d7ee2645df5b261ee1b2135d190(call.args, call.ctx);
		default:
			throw new Error(`land has no impl for ${call.usage}`);
	}
}
