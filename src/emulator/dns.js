"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Resolver = exports.IPV6_UNSPECIFIED = exports.IPV4_UNSPECIFIED = exports.IPV6_LOOPBACK = exports.IPV4_LOOPBACK = void 0;
const node_dns_1 = require("node:dns"); // Not using "dns/promises" for Node 14 compatibility.
const node_net_1 = require("node:net");
const logger_1 = require("../logger");
exports.IPV4_LOOPBACK = { address: "127.0.0.1", family: 4 };
exports.IPV6_LOOPBACK = { address: "::1", family: 6 };
exports.IPV4_UNSPECIFIED = { address: "0.0.0.0", family: 4 };
exports.IPV6_UNSPECIFIED = { address: "::", family: 6 };
/**
 * Resolves hostnames to IP addresses consistently.
 *
 * The result(s) for a single hostname is cached in memory to ensure consistency
 * throughout the lifetime or a single process (i.e. CLI command invocation).
 */
class Resolver {
    /**
     * Create a new Resolver instance with its own dedicated cache.
     *
     * @param lookup an underlying DNS lookup function (useful in tests)
     */
    constructor(lookup = node_dns_1.promises.lookup) {
        this.lookup = lookup;
        this.cache = new Map([
            // Pre-populate cache with localhost (the most common hostname used in
            // emulators) for quicker startup and better consistency across OSes.
            ["localhost", [exports.IPV4_LOOPBACK, exports.IPV6_LOOPBACK]],
        ]);
    }
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
    async lookupFirst(hostname) {
        const addresses = await this.lookupAll(hostname);
        if (addresses.length === 1) {
            return addresses[0];
        }
        // Log a debug message when discarding additional results:
        const result = addresses[0];
        const discarded = [];
        for (let i = 1; i < addresses.length; i++) {
            discarded.push(result.address);
        }
        logger_1.logger.debug(`Resolved hostname "${hostname}" to the first result "${result.address}" (ignoring candidates: ${discarded.join(",")}).`);
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
    async lookupAll(hostname) {
        const family = (0, node_net_1.isIP)(hostname);
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
exports.Resolver = Resolver;
/**
 * The default resolver. Preferred in all normal CLI operations.
 */
Resolver.DEFAULT = new Resolver();
//# sourceMappingURL=dns.js.map