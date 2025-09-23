import { LookupAddress, LookupAllOptions, promises as dnsPromises } from "node:dns"; // Not using "dns/promises" for Node 14 compatibility.
import { isIP } from "node:net";
import { logger } from "../logger";

export const IPV4_LOOPBACK = { address: "127.0.0.1", family: 4 } as const;
export const IPV6_LOOPBACK = { address: "::1", family: 6 } as const;
export const IPV4_UNSPECIFIED = { address: "0.0.0.0", family: 4 } as const;
export const IPV6_UNSPECIFIED = { address: "::", family: 6 } as const;

/**
 * Resolves hostnames to IP addresses consistently.
 *
 * The result(s) for a single hostname is cached in memory to ensure consistency
 * throughout the lifetime or a single process (i.e. CLI command invocation).
 */
export class Resolver {
  /**
   * The default resolver. Preferred in all normal CLI operations.
   */
  public static DEFAULT = new Resolver();

  private cache = new Map<string, LookupAddress[]>([
    // Pre-populate cache with localhost (the most common hostname used in
    // emulators) for quicker startup and better consistency across OSes.
    ["localhost", [IPV4_LOOPBACK, IPV6_LOOPBACK]],
  ]);

  /**
   * Create a new Resolver instance with its own dedicated cache.
   *
   * @param lookup an underlying DNS lookup function (useful in tests)
   */
  public constructor(
    private lookup: (
      hostname: string,
      options: LookupAllOptions,
    ) => Promise<LookupAddress[]> = dnsPromises.lookup,
  ) {}

  /**
   * Returns the first IP address that a hostname map to, ignoring others.
   *
   * If possible, prefer `lookupAll` and handle all results instead, since the
   * first one may not be what the user wants. Especially, when a domain name is
   * specified as the listening hostname of a server, listening on both IPv4 and
   * IPv6 addresses may be closer to user intention.
   *
   * A successful lookup will add the results to the cache, which will be used
   * to serve subsequent requests to the same hostname on the same `Resolver`.
   *
   * @param hostname the hostname to resolve
   * @return the first IP address (perferrably IPv4 for compatibility)
   */
  async lookupFirst(hostname: string): Promise<LookupAddress> {
    const addresses = await this.lookupAll(hostname);
    if (addresses.length === 1) {
      return addresses[0];
    }

    // Log a debug message when discarding additional results:
    const result = addresses[0];
    const discarded: string[] = [];
    for (let i = 1; i < addresses.length; i++) {
      discarded.push(result.address);
    }
    logger.debug(
      `Resolved hostname "${hostname}" to the first result "${
        result.address
      }" (ignoring candidates: ${discarded.join(",")}).`,
    );
    return result;
  }

  /**
   * Returns all IP addresses that a hostname map to, IPv4 first (if present).
   *
   * A successful lookup will add the results to the cache, which will be used
   * to serve subsequent requests to the same hostname on the same `Resolver`.
   *
   * @param hostname the hostname to resolve
   * @return IP addresses (IPv4 addresses before IPv6 ones for compatibility)
   */
  async lookupAll(hostname: string): Promise<LookupAddress[]> {
    const family = isIP(hostname);
    if (family > 0) {
      return [{ family, address: hostname }];
    }
    // We may want to make this case-insensitive if customers run into issues.
    const cached = this.cache.get(hostname);
    if (cached) {
      return cached;
    }
    const addresses = await this.lookup(hostname, {
      // Return IPv4 addresses first (for backwards compatibility).
      verbatim: false,
      all: true,
    });
    this.cache.set(hostname, addresses);
    return addresses;
  }
}
