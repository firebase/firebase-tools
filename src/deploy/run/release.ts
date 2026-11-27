import { logLabeledSuccess } from "../../utils";
import { Payload } from "./args";

/**
 * Logs where each deployed service is available. The deploy step already rolled them out, so that
 * they're live before other products release (e.g. Hosting, whose rewrites can point at them).
 */
export async function release(
  _context: unknown,
  _options: unknown,
  payload: Payload,
): Promise<void> {
  for (const { config, deployed } of payload.run?.services || []) {
    logLabeledSuccess(
      "run",
      `Deployed service ${config.serviceId} in ${config.region}${deployed?.uri ? ` to ${deployed.uri}` : ""}`,
    );
  }
}
