import type { Options } from "./options";

import { FirebaseError } from "./error";
import { APPHOSTING_TOS_ID, TosId, getTosStatus, isProductTosAccepted } from "./gcp/firedata";
import { consoleOrigin } from "./api";

const consoleLandingPage = new Map<TosId, string>([
  [APPHOSTING_TOS_ID, `${consoleOrigin()}/project/_/apphosting`],
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
 **/
export function requireTosAcceptance(tosId: TosId): (options: Options) => Promise<void> {
  return () => requireTos(tosId);
}

async function requireTos(tosId: TosId): Promise<void> {
  const res = await getTosStatus();
  if (isProductTosAccepted(res, tosId)) {
    return;
  }
  if (consoleLandingPage.has(tosId)) {
    throw new FirebaseError(
      `Exiting due to missing terms of service agreement on your account. Visit ${consoleLandingPage.get(tosId)} to get started.`,
    );
  }
  throw new FirebaseError(
    `Exiting due to missing terms of service agreement for ${tosId}. Visit ${consoleOrigin()} to get started.`,
  );
}
