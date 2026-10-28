import type { ActionCall } from "nosedive-core";
import { iffc777778a63553ba90babcc038eb748 } from "./iffc777778a63553ba90babcc038eb748.ts";

export async function i01a15bb276d17aa2b4e5dcc260c69c00(call: ActionCall): Promise<void> {
	switch (call.usage) {
		case "uffc777778a63553ba90babcc038eb748": // bail [<dive>] --reason <why>
			return iffc777778a63553ba90babcc038eb748(call.args, call.ctx);
		default:
			throw new Error(`bail has no impl for ${call.usage}`);
	}
}
