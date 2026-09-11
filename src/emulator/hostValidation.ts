import * as express from "express";

/**
 * Returns true if the given address refers to the loopback interface (and is
 * therefore only reachable from the local machine).
 *
 * Note: "0.0.0.0" (and IPv6 "::") mean "all interfaces" and are NOT loopback —
 * binding to them opts into remote access, so they are treated as non-loopback.
 */
export function isLoopbackAddress(addr: string): boolean {
  const normalized = addr.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.startsWith("127.")
  );
}

/**
 * Strip the trailing ":port" from a Host header value, returning the bare
 * hostname (lowercased). Handles bracketed IPv6 hosts like "[::1]:5000".
 */
function bareHostname(host: string): string {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) {
    // Bracketed IPv6 host, e.g. "[::1]" or "[::1]:5000".
    const closing = trimmed.indexOf("]");
    if (closing !== -1) {
      return trimmed.substring(0, closing + 1);
    }
    return trimmed;
  }
  // IPv4 / hostname: only strip the port if there's a single colon. A bare
  // unbracketed IPv6 address (multiple colons) has no port suffix to strip.
  const firstColon = trimmed.indexOf(":");
  if (firstColon !== -1 && trimmed.indexOf(":", firstColon + 1) === -1) {
    return trimmed.substring(0, firstColon);
  }
  return trimmed;
}

/**
 * Express middleware that rejects requests with an untrusted Host header to
 * mitigate DNS-rebinding attacks against the (unauthenticated) emulator APIs.
 *
 * Enforcement only happens when the emulator is bound exclusively to loopback
 * addresses. If the operator bound to a non-loopback address (e.g. "0.0.0.0"
 * or a specific public host) they have opted into remote access (such as tunnel
 * support, see https://github.com/firebase/firebase-tools/issues/4227) and the
 * middleware becomes a no-op so as not to break those setups.
 *
 * @param bindAddresses the address(es) the emulator is listening on.
 */
export function hostValidationMiddleware(bindAddresses: string[]): express.RequestHandler {
  // Cannot determine the bind address(es) — don't break anything.
  if (bindAddresses.length === 0) {
    return (req, res, next) => next();
  }

  // Operator opted into remote access by binding to a non-loopback address.
  if (!bindAddresses.every((addr) => isLoopbackAddress(addr))) {
    return (req, res, next) => next();
  }

  const allowedHosts = new Set(["localhost", "::1", "[::1]"]);
  for (const addr of bindAddresses) {
    allowedHosts.add(addr.trim().toLowerCase());
  }

  return (req, res, next) => {
    const hostHeader = req.headers.host;
    if (!hostHeader) {
      // No Host header — nothing to validate against.
      return next();
    }

    const host = bareHostname(hostHeader);
    if (host.startsWith("127.") || allowedHosts.has(host)) {
      return next();
    }

    res.status(403).json({
      error:
        `Request blocked due to an untrusted Host header "${host}". ` +
        `The Firebase Emulator Suite only accepts requests with a loopback Host header to ` +
        `mitigate DNS-rebinding; bind the emulator to a non-loopback host to allow remote access.`,
    });
  };
}
