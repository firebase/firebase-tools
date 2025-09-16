"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listenSpecsToString = exports.resolveHostAndAssignPorts = exports.waitForPortUsed = exports.checkListenable = void 0;
const clc = require("colorette");
const tcpport = require("tcp-port-used");
const node_net_1 = require("node:net");
const error_1 = require("../error");
const utils = require("../utils");
const dns_1 = require("./dns");
const types_1 = require("./types");
const constants_1 = require("./constants");
const emulatorLogger_1 = require("./emulatorLogger");
const node_child_process_1 = require("node:child_process");
// See:
// - https://stackoverflow.com/questions/4313403/why-do-browsers-block-some-ports
// - https://chromium.googlesource.com/chromium/src.git/+/refs/heads/master/net/base/port_util.cc
const RESTRICTED_PORTS = new Set([
    1,
    7,
    9,
    11,
    13,
    15,
    17,
    19,
    20,
    21,
    22,
    23,
    25,
    37,
    42,
    43,
    53,
    77,
    79,
    87,
    95,
    101,
    102,
    103,
    104,
    109,
    110,
    111,
    113,
    115,
    117,
    119,
    123,
    135,
    139,
    143,
    179,
    389,
    427,
    465,
    512,
    513,
    514,
    515,
    526,
    530,
    531,
    532,
    540,
    548,
    556,
    563,
    587,
    601,
    636,
    993,
    995,
    2049,
    3659,
    4045,
    6000,
    6665,
    6666,
    6667,
    6668,
    6669,
    6697, // IRC + TLS
]);
/**
 * Check if a given port is restricted by Chrome.
 */
function isRestricted(port) {
    return RESTRICTED_PORTS.has(port);
}
/**
 * Suggest a port equal to or higher than the given port which is not restricted by Chrome.
 */
function suggestUnrestricted(port) {
    if (!isRestricted(port)) {
        return port;
    }
    let newPort = port;
    while (isRestricted(newPort)) {
        newPort++;
    }
    return newPort;
}
async function checkListenable(arg1, port) {
    const addr = port === undefined ? arg1 : listenSpec(arg1, port);
    // Not using tcpport.check since it is based on trying to establish a Socket
    // connection, not on *listening* on a host:port.
    return new Promise((resolve, reject) => {
        // For SOME REASON, we can still create a server on port 5000 on macOS. Why
        // we do not know, but we need to keep this stupid check here because we
        // *do* want to still *try* to default to 5000.
        if (process.platform === "darwin") {
            try {
                (0, node_child_process_1.execSync)(`lsof -i :${addr.port} -sTCP:LISTEN`);
                // If this succeeds, it found something listening. Fail.
                return resolve(false);
            }
            catch (e) {
                // If lsof errored the port is NOT in use, continue.
            }
        }
        const dummyServer = (0, node_net_1.createServer)();
        dummyServer.once("error", (err) => {
            dummyServer.removeAllListeners();
            const e = err;
            if (e.code === "EADDRINUSE" || e.code === "EACCES") {
                resolve(false);
            }
            else {
                reject(e);
            }
        });
        dummyServer.once("listening", () => {
            dummyServer.removeAllListeners();
            dummyServer.close((err) => {
                dummyServer.removeAllListeners();
                if (err) {
                    reject(err);
                }
                else {
                    resolve(true);
                }
            });
        });
        dummyServer.listen({ host: addr.address, port: addr.port, ipv6Only: addr.family === "IPv6" });
    });
}
exports.checkListenable = checkListenable;
/**
 * Wait for a port to be available on the given host. Checks every 250ms for up to timeout (default 60s).
 */
async function waitForPortUsed(port, host, timeout = 60000) {
    const interval = 200;
    try {
        await tcpport.waitUntilUsedOnHost(port, host, interval, timeout);
    }
    catch (e) {
        throw new error_1.FirebaseError(`TIMEOUT: Port ${port} on ${host} was not active within ${timeout}ms`);
    }
}
exports.waitForPortUsed = waitForPortUsed;
const EMULATOR_CAN_LISTEN_ON_PRIMARY_ONLY = {
    // External processes that accept only one hostname and one port, and will
    // bind to only one of the addresses resolved from hostname.
    database: true,
    firestore: true,
    "firestore.websocket": true,
    pubsub: true,
    "dataconnect.postgres": true,
    // External processes that accepts multiple listen specs.
    dataconnect: false,
    // Listening on multiple addresses to maximize the chance of discovery.
    hub: false,
    // Separate Node.js process that supports multi-listen. For consistency, we
    // resolve the addresses in the CLI and pass the result to the UI.
    ui: false,
    // TODO: Modify the following emulators to listen on multiple addresses.
    // Express-based servers, can be reused for multiple listen sockets.
    auth: true,
    eventarc: true,
    extensions: true,
    functions: true,
    logging: true,
    storage: true,
    tasks: true,
    // Only one hostname possible in .server mode, can switch to middleware later.
    hosting: true,
    apphosting: true,
};
const MAX_PORT = 65535; // max TCP port
/**
 * Resolve the hostname and assign ports to a subset of emulators.
 *
 * @param listenConfig the config for each emulator or previously resolved specs
 * @return a map from emulator to its resolved addresses with port.
 */
async function resolveHostAndAssignPorts(listenConfig) {
    const lookupForHost = new Map();
    const takenPorts = new Map();
    const result = {};
    const tasks = [];
    for (const name of Object.keys(listenConfig)) {
        const config = listenConfig[name];
        if (!config) {
            continue;
        }
        else if (config instanceof Array) {
            result[name] = config;
            for (const { port } of config) {
                takenPorts.set(port, name);
            }
            continue;
        }
        const { host, port, portFixed } = config;
        let lookup = lookupForHost.get(host);
        if (!lookup) {
            lookup = dns_1.Resolver.DEFAULT.lookupAll(host);
            lookupForHost.set(host, lookup);
        }
        const findAddrs = lookup.then(async (addrs) => {
            const emuLogger = emulatorLogger_1.EmulatorLogger.forEmulator(name === "firestore.websocket"
                ? types_1.Emulators.FIRESTORE
                : name === "dataconnect.postgres"
                    ? types_1.Emulators.DATACONNECT
                    : name);
            if (addrs.some((addr) => addr.address === dns_1.IPV6_UNSPECIFIED.address)) {
                if (!addrs.some((addr) => addr.address === dns_1.IPV4_UNSPECIFIED.address)) {
                    // In normal Node.js code (including CLI versions so far), listening
                    // on IPv6 :: will also listen on IPv4 0.0.0.0 (a.k.a. "dual stack").
                    // Maintain that behavior if both are listenable. Warn otherwise.
                    emuLogger.logLabeled("DEBUG", name, `testing listening on IPv4 wildcard in addition to IPv6. To listen on IPv6 only, use "::0" instead.`);
                    addrs.push(dns_1.IPV4_UNSPECIFIED);
                }
            }
            for (let p = port; p <= MAX_PORT; p++) {
                if (takenPorts.has(p)) {
                    continue;
                }
                if (!portFixed && RESTRICTED_PORTS.has(p)) {
                    emuLogger.logLabeled("DEBUG", name, `portUtils: skipping restricted port ${p}`);
                    continue;
                }
                if (p === 5001 && /^hosting/i.exec(name)) {
                    // We don't want Hosting to ever try to take port 5001.
                    continue;
                }
                const available = [];
                const unavailable = [];
                let i;
                for (i = 0; i < addrs.length; i++) {
                    const addr = addrs[i];
                    const listen = listenSpec(addr, p);
                    // This must be done one by one since the addresses may overlap.
                    let listenable;
                    try {
                        listenable = await checkListenable(listen);
                    }
                    catch (err) {
                        emuLogger.logLabeled("WARN", name, `Error when trying to check port ${p} on ${addr.address}: ${err}`);
                        // Even if portFixed is false, don't try other ports since the
                        // address may be entirely unavailable on all ports (e.g. no IPv6).
                        // https://github.com/firebase/firebase-tools/issues/4741#issuecomment-1275318134
                        unavailable.push(addr.address);
                        continue;
                    }
                    if (listenable) {
                        available.push(listen);
                    }
                    else {
                        if (!portFixed) {
                            // Try to find another port to avoid any potential conflict.
                            if (i > 0) {
                                emuLogger.logLabeled("DEBUG", name, `Port ${p} taken on secondary address ${addr.address}, will keep searching to find a better port.`);
                            }
                            break;
                        }
                        unavailable.push(addr.address);
                    }
                }
                if (i === addrs.length) {
                    if (unavailable.length > 0) {
                        if (unavailable[0] === addrs[0].address) {
                            // The port is not available on the primary address, we should err
                            // on the side of safety and let the customer choose a different port.
                            return fixedPortNotAvailable(name, host, port, emuLogger, unavailable);
                        }
                        // For backward compatibility, we'll start listening as long as
                        // the primary address is available. Skip listening on the
                        // unavailable ones with a warning.
                        warnPartiallyAvailablePort(emuLogger, port, available, unavailable);
                    }
                    // If available, take it and prevent any other emulator from doing so.
                    if (takenPorts.has(p)) {
                        continue;
                    }
                    takenPorts.set(p, name);
                    if (RESTRICTED_PORTS.has(p)) {
                        const suggested = suggestUnrestricted(port);
                        emuLogger.logLabeled("WARN", name, `Port ${port} is restricted by some web browsers, including Chrome. You may want to choose a different port such as ${suggested}.`);
                    }
                    if (p !== port && name !== "firestore.websocket") {
                        emuLogger.logLabeled("WARN", `${portDescription(name)} unable to start on port ${port}, starting on ${p} instead.`);
                    }
                    if (available.length > 1 && EMULATOR_CAN_LISTEN_ON_PRIMARY_ONLY[name]) {
                        emuLogger.logLabeled("DEBUG", name, `${portDescription(name)} only supports listening on one address (${available[0].address}). Not listening on ${addrs
                            .slice(1)
                            .map((s) => s.address)
                            .join(",")}`);
                        result[name] = [available[0]];
                    }
                    else {
                        result[name] = available;
                    }
                    return;
                }
            }
            // This should be extremely rare.
            return utils.reject(`Could not find any open port in ${port}-${MAX_PORT} for ${portDescription(name)}`, {});
        });
        tasks.push(findAddrs);
    }
    await Promise.all(tasks);
    return result;
}
exports.resolveHostAndAssignPorts = resolveHostAndAssignPorts;
function portDescription(name) {
    return name === "firestore.websocket"
        ? `websocket server for ${types_1.Emulators.FIRESTORE}`
        : name === "dataconnect.postgres"
            ? `postgres server for ${types_1.Emulators.DATACONNECT}`
            : constants_1.Constants.description(name);
}
function warnPartiallyAvailablePort(emuLogger, port, available, unavailable) {
    emuLogger.logLabeled("WARN", `Port ${port} is available on ` +
        available.map((s) => s.address).join(",") +
        ` but not ${unavailable.join(",")}. This may cause issues with some clients.`);
    emuLogger.logLabeled("WARN", `If you encounter connectivity issues, consider switching to a different port or explicitly specifying ${clc.yellow('"host": "<ip address>"')} instead of hostname in firebase.json`);
}
function fixedPortNotAvailable(name, host, port, emuLogger, unavailableAddrs) {
    if (unavailableAddrs.length !== 1 || unavailableAddrs[0] !== host) {
        // Show detailed resolved addresses
        host = `${host} (${unavailableAddrs.join(",")})`;
    }
    const description = portDescription(name);
    emuLogger.logLabeled("WARN", `Port ${port} is not open on ${host}, could not start ${description}.`);
    if (name === "firestore.websocket") {
        emuLogger.logLabeled("WARN", `To select a different port, specify that port in a firebase.json config file:
      {
        // ...
        "emulators": {
          "${types_1.Emulators.FIRESTORE}": {
            "host": "${clc.yellow("HOST")}",
            ...
            "websocketPort": "${clc.yellow("WEBSOCKET_PORT")}"
          }
        }
      }`);
    }
    else {
        emuLogger.logLabeled("WARN", `To select a different host/port, specify that host/port in a firebase.json config file:
      {
        // ...
        "emulators": {
          "${emuLogger.name}": {
            "host": "${clc.yellow("HOST")}",
            "port": "${clc.yellow("PORT")}"
          }
        }
      }`);
    }
    return utils.reject(`Could not start ${description}, port taken.`, {});
}
function listenSpec(lookup, port) {
    if (lookup.family !== 4 && lookup.family !== 6) {
        throw new Error(`Unsupported address family "${lookup.family}" for address ${lookup.address}.`);
    }
    return {
        address: lookup.address,
        family: lookup.family === 4 ? "IPv4" : "IPv6",
        port: port,
    };
}
/**
 * Return a comma-separated list of host:port from specs.
 */
function listenSpecsToString(specs) {
    return specs
        .map((spec) => {
        const host = spec.family === "IPv4" ? spec.address : `[${spec.address}]`;
        return `${host}:${spec.port}`;
    })
        .join(",");
}
exports.listenSpecsToString = listenSpecsToString;
