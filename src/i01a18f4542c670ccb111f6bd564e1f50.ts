import type { ActionCall } from "nosedive-core";
import { i479700c5af155d8f9c0d2a0f4bea5c41 } from "./i479700c5af155d8f9c0d2a0f4bea5c41.ts";

export async function i01a18f4542c670ccb111f6bd564e1f50(call: ActionCall): Promise<void> {
	switch (call.usage) {
		case "u479700c5af155d8f9c0d2a0f4bea5c41": { // pass --turn <dive> [<summary>] [--next <gist>] [--label <label>]
			if (!call.gate) throw new Error("turn runs through pass");
			// GateCtx does not carry stdin; the action call owns that input.
			const args = { ...call.gate.args };
			if (args.summary === "-") args.summary = await call.ctx.stdin();
			return i479700c5af155d8f9c0d2a0f4bea5c41({ ...call.gate, args });
		}
		default:
			throw new Error(`turn has no impl for ${call.usage}`);
	}
}
