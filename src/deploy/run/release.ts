import { logLabeledSuccess } from "../../utils";
import { Payload } from "./args";

/**
 * Logs where each deployed service is available.
 */
export async function release(
  _context: unknown,
  _options: unknown,
  payload: Payload,
): Promise<void> {
  for (const { config, deployed } of payload.run?.services || []) {
    logLabeledSuccess(
      "run",
      `Deployed service ${config.serviceId}${deployed?.uri ? ` to ${deployed.uri}` : ""}`,
    );
  }
}
