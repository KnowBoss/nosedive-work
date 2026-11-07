import type { ActionCall } from "nosedive-core";
import { i16b8d55a332958f3b47989994ca5c52c } from "./i16b8d55a332958f3b47989994ca5c52c.ts";
import { i012ea2e903345c02b1cc8786221f93cd } from "./i012ea2e903345c02b1cc8786221f93cd.ts";

export async function i01a1b45b04a079a494fed25a3665456d(call: ActionCall): Promise<void> {
	switch (call.usage) {
		case "u16b8d55a332958f3b47989994ca5c52c": // before crud dive
			return i16b8d55a332958f3b47989994ca5c52c(call.gate!);
		case "u012ea2e903345c02b1cc8786221f93cd": // after crud dive
			return i012ea2e903345c02b1cc8786221f93cd(call.gate!);
		default:
			throw new Error(`dive-shape has no impl for ${call.usage}`);
	}
}
