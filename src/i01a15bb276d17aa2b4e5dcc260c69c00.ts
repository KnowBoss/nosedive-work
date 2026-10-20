import type { ActionCall } from "nosedive-core";
import { ifa8cd225959e58129b06dc2cc5a5b837 } from "./ifa8cd225959e58129b06dc2cc5a5b837.ts";

export async function i01a15bb276d17aa2b4e5dcc260c69c00(call: ActionCall): Promise<void> {
	switch (call.usage) {
		case "ufa8cd225959e58129b06dc2cc5a5b837": // bail --reason <why>
			return ifa8cd225959e58129b06dc2cc5a5b837(call.args, call.ctx);
		default:
			throw new Error(`bail has no impl for ${call.usage}`);
	}
}
