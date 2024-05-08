import type { Options } from "./options";

import { FirebaseError } from "./error";
import {
  APPHOSTING_TOS_ID,
  DATA_CONNECT_TOS_ID,
  TosId,
  getTosStatus,
  isProductTosAccepted,
} from "./gcp/firedata";
import { consoleOrigin } from "./api";

const consoleLandingPage = new Map<TosId, string>([
  [APPHOSTING_TOS_ID, `${consoleOrigin()}/project/_/apphosting`],
  [DATA_CONNECT_TOS_ID, `${consoleOrigin()}/project/_/dataconnect`],
]);

/**
 * Returns a function that checks product terms of service. Useful for Command `before` hooks.
 *
 * Example:
 *   new Command(...)
 *     .description(...)
 *     .before(requireTosAcceptance(APPHOSTING_TOS_ID)) ;
 *
 * Note: When supporting new products, be sure to update `consoleLandingPage` above to avoid surfacing
 * generic ToS error messages.
 */
export function requireTosAcceptance(tosId: TosId): (options: Options) => Promise<void> {
  return () => requireTos(tosId);
}

async function requireTos(tosId: TosId): Promise<void> {
  const res = await getTosStatus();
  if (isProductTosAccepted(res, tosId)) {
    return;
  }
  const console = consoleLandingPage.get(tosId) || consoleOrigin();
  throw new FirebaseError(
    `Your account has not accepted the required Terms of Service for this action. Please accept the Terms of Service and try again. ${console}`,
  );
}
