import * as clc from "colorette";
import * as tcpport from "tcp-port-used";
import * as dns from "dns";
import { createServer } from "node:net";

import { FirebaseError } from "../error";
import * as utils from "../utils";
import { IPV4_UNSPECIFIED, IPV6_UNSPECIFIED, Resolver } from "./dns";
import { Emulators, ListenSpec } from "./types";
import { Constants } from "./constants";
import { EmulatorLogger } from "./emulatorLogger";
import { execSync } from "node:child_process";

// See:
// - https://stackoverflow.com/questions/4313403/why-do-browsers-block-some-ports
// - https://chromium.googlesource.com/chromium/src.git/+/refs/heads/master/net/base/port_util.cc
const RESTRICTED_PORTS = new Set([
  1, // tcpmux
  7, // echo
  9, // discard
  11, // systat
  13, // daytime
  15, // netstat
  17, // qotd
  19, // chargen
  20, // ftp data
  21, // ftp access
  22, // ssh
  23, // telnet
  25, // smtp
  37, // time
  42, // name
  43, // nicname
  53, // domain
  77, // priv-rjs
  79, // finger
  87, // ttylink
  95, // supdup
  101, // hostriame
  102, // iso-tsap
  103, // gppitnp
  104, // acr-nema
  109, // pop2
  110, // pop3
  111, // sunrpc
  113, // auth
  115, // sftp
  117, // uucp-path
  119, // nntp
  123, // NTP
  135, // loc-srv /epmap
  139, // netbios
  143, // imap2
  179, // BGP
  389, // ldap
  427, // SLP (Also used by Apple Filing Protocol)
  465, // smtp+ssl
  512, // print / exec
  513, // login
  514, // shell
  515, // printer
  526, // tempo
  530, // courier
  531, // chat
  532, // netnews
  540, // uucp
  548, // AFP (Apple Filing Protocol)
  556, // remotefs
  563, // nntp+ssl
  587, // smtp (rfc6409)
  601, // syslog-conn (rfc3195)
  636, // ldap+ssl
  993, // ldap+ssl
  995, // pop3+ssl
  2049, // nfs
  3659, // apple-sasl / PasswordServer
  4045, // lockd
  6000, // X11
  6665, // Alternate IRC [Apple addition]
  6666, // Alternate IRC [Apple addition]
  6667, // Standard IRC [Apple addition]
  6668, // Alternate IRC [Apple addition]
  6669, // Alternate IRC [Apple addition]
  6697, // IRC + TLS
]);

/**
 * Check if a given port is restricted by Chrome.
 */
function isRestricted(port: number): boolean {
  return RESTRICTED_PORTS.has(port);
}

/**
 * Suggest a port equal to or higher than the given port which is not restricted by Chrome.
 */
function suggestUnrestricted(port: number): number {
  if (!isRestricted(port)) {
    return port;
  }

  let newPort = port;
  while (isRestricted(newPort)) {
    newPort++;
  }

  return newPort;
}

/**
 * Check if a port is available for listening on the given address.
 */
export async function checkListenable(addr: dns.LookupAddress, port: number): Promise<boolean>;
export async function checkListenable(listen: ListenSpec): Promise<boolean>;
export async function checkListenable(
  arg1: dns.LookupAddress | ListenSpec,
  port?: number,
): Promise<boolean> {
  const addr =
    port === undefined ? (arg1 as ListenSpec) : listenSpec(arg1 as dns.LookupAddress, port);

  // Not using tcpport.check since it is based on trying to establish a Socket
  // connection, not on *listening* on a host:port.
  return new Promise((resolve, reject) => {
    // For SOME REASON, we can still create a server on port 5000 on macOS. Why
    // we do not know, but we need to keep this stupid check here because we
    // *do* want to still *try* to default to 5000.
    if (process.platform === "darwin") {
      try {
        execSync(`lsof -i :${addr.port} -sTCP:LISTEN`);
        // If this succeeds, it found something listening. Fail.
        return resolve(false);
      } catch (e) {
        // If lsof errored the port is NOT in use, continue.
      }
    }
    const dummyServer = createServer();
    dummyServer.once("error", (err) => {
      dummyServer.removeAllListeners();
      const e = err as Error & { code?: string };
      if (e.code === "EADDRINUSE" || e.code === "EACCES") {
        resolve(false);
      } else {
        reject(e);
      }
    });
    dummyServer.once("listening", () => {
      dummyServer.removeAllListeners();
      dummyServer.close((err) => {
        dummyServer.removeAllListeners();
        if (err) {
          reject(err);
        } else {
          resolve(true);
        }
      });
    });
    dummyServer.listen({ host: addr.address, port: addr.port, ipv6Only: addr.family === "IPv6" });
  });
}

/**
 * Wait for a port to be available on the given host. Checks every 250ms for up to 60s.
 */
export async function waitForPortUsed(port: number, host: string): Promise<void> {
  const interval = 250;
  const timeout = 60_000;
  try {
    await tcpport.waitUntilUsedOnHost(port, host, interval, timeout);
  } catch (e: any) {
    throw new FirebaseError(`TIMEOUT: Port ${port} on ${host} was not active within ${timeout}ms`);
  }
}

export type PortName = Emulators | "firestore.websocket";

const EMULATOR_CAN_LISTEN_ON_PRIMARY_ONLY: Record<PortName, boolean> = {
  // External processes that accept only one hostname and one port, and will
  // bind to only one of the addresses resolved from hostname.
  database: true,
  firestore: true,
  "firestore.websocket": true,
  pubsub: true,

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

  // Only one hostname possible in .server mode, can switch to middleware later.
  hosting: true,
};

export interface EmulatorListenConfig {
  host: string;
  port: number;
  portFixed?: boolean;
}

const MAX_PORT = 65535; // max TCP port

/**
 * Resolve the hostname and assign ports to a subset of emulators.
 *
 * @param listenConfig the config for each emulator or previously resolved specs
 * @return a map from emulator to its resolved addresses with port.
 */
export async function resolveHostAndAssignPorts(
  listenConfig: Partial<Record<PortName, EmulatorListenConfig | ListenSpec[]>>,
): Promise<Record<PortName, ListenSpec[]>> {
  const lookupForHost = new Map<string, Promise<dns.LookupAddress[]>>();
  const takenPorts = new Map<number, PortName>();

  const result = {} as Record<PortName, ListenSpec[]>;
  const tasks = [];
  for (const name of Object.keys(listenConfig) as PortName[]) {
    const config = listenConfig[name];
    if (!config) {
      continue;
    } else if (config instanceof Array) {
      result[name] = config;
      for (const { port } of config) {
        takenPorts.set(port, name);
      }
      continue;
    }
    const { host, port, portFixed } = config;
    let lookup = lookupForHost.get(host);
    if (!lookup) {
      lookup = Resolver.DEFAULT.lookupAll(host);
      lookupForHost.set(host, lookup);
    }
    const findAddrs = lookup.then(async (addrs) => {
      const emuLogger = EmulatorLogger.forEmulator(
        name === "firestore.websocket" ? Emulators.FIRESTORE : name,
      );
      if (addrs.some((addr) => addr.address === IPV6_UNSPECIFIED.address)) {
        if (!addrs.some((addr) => addr.address === IPV4_UNSPECIFIED.address)) {
          // In normal Node.js code (including CLI versions so far), listening
          // on IPv6 :: will also listen on IPv4 0.0.0.0 (a.k.a. "dual stack").
          // Maintain that behavior if both are listenable. Warn otherwise.
          emuLogger.logLabeled(
            "DEBUG",
            name,
            `testing listening on IPv4 wildcard in addition to IPv6. To listen on IPv6 only, use "::0" instead.`,
          );
          addrs.push(IPV4_UNSPECIFIED);
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
        const available: ListenSpec[] = [];
        const unavailable: string[] = [];
        let i;
        for (i = 0; i < addrs.length; i++) {
          const addr = addrs[i];
          const listen = listenSpec(addr, p);
          // This must be done one by one since the addresses may overlap.
          let listenable: boolean;
          try {
            listenable = await checkListenable(listen);
          } catch (err) {
            emuLogger.logLabeled(
              "WARN",
              name,
              `Error when trying to check port ${p} on ${addr.address}: ${err}`,
            );
            // Even if portFixed is false, don't try other ports since the
            // address may be entirely unavailable on all ports (e.g. no IPv6).
            // https://github.com/firebase/firebase-tools/issues/4741#issuecomment-1275318134
            unavailable.push(addr.address);
            continue;
          }
          if (listenable) {
            available.push(listen);
          } else {
            if (!portFixed) {
              // Try to find another port to avoid any potential conflict.
              if (i > 0) {
                emuLogger.logLabeled(
                  "DEBUG",
                  name,
                  `Port ${p} taken on secondary address ${addr.address}, will keep searching to find a better port.`,
                );
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
            emuLogger.logLabeled(
              "WARN",
              name,
              `Port ${port} is restricted by some web browsers, including Chrome. You may want to choose a different port such as ${suggested}.`,
            );
          }
          if (p !== port && name !== "firestore.websocket") {
            emuLogger.logLabeled(
              "WARN",
              `${portDescription(name)} unable to start on port ${port}, starting on ${p} instead.`,
            );
          }
          if (available.length > 1 && EMULATOR_CAN_LISTEN_ON_PRIMARY_ONLY[name]) {
            emuLogger.logLabeled(
              "DEBUG",
              name,
              `${portDescription(name)} only supports listening on one address (${
                available[0].address
              }). Not listening on ${addrs
                .slice(1)
                .map((s) => s.address)
                .join(",")}`,
            );
            result[name] = [available[0]];
          } else {
            result[name] = available;
          }
          return;
        }
      }
      // This should be extremely rare.
      return utils.reject(
        `Could not find any open port in ${port}-${MAX_PORT} for ${portDescription(name)}`,
        {},
      );
    });
    tasks.push(findAddrs);
  }

  await Promise.all(tasks);
  return result;
}

function portDescription(name: PortName): string {
  return name === "firestore.websocket"
    ? `websocket server for ${Emulators.FIRESTORE}`
    : Constants.description(name);
}

function warnPartiallyAvailablePort(
  emuLogger: EmulatorLogger,
  port: number,
  available: ListenSpec[],
  unavailable: string[],
): void {
  emuLogger.logLabeled(
    "WARN",
    `Port ${port} is available on ` +
      available.map((s) => s.address).join(",") +
      ` but not ${unavailable.join(",")}. This may cause issues with some clients.`,
  );
  emuLogger.logLabeled(
    "WARN",
    `If you encounter connectivity issues, consider switching to a different port or explicitly specifying ${clc.yellow(
      '"host": "<ip address>"',
    )} instead of hostname in firebase.json`,
  );
}

function fixedPortNotAvailable(
  name: PortName,
  host: string,
  port: number,
  emuLogger: EmulatorLogger,
  unavailableAddrs: string[],
): Promise<never> {
  if (unavailableAddrs.length !== 1 || unavailableAddrs[0] !== host) {
    // Show detailed resolved addresses
    host = `${host} (${unavailableAddrs.join(",")})`;
  }
  const description = portDescription(name);
  emuLogger.logLabeled(
    "WARN",
    `Port ${port} is not open on ${host}, could not start ${description}.`,
  );
  if (name === "firestore.websocket") {
    emuLogger.logLabeled(
      "WARN",
      `To select a different port, specify that port in a firebase.json config file:
      {
        // ...
        "emulators": {
          "${Emulators.FIRESTORE}": {
            "host": "${clc.yellow("HOST")}",
            ...
            "websocketPort": "${clc.yellow("WEBSOCKET_PORT")}"
          }
        }
      }`,
    );
  } else {
    emuLogger.logLabeled(
      "WARN",
      `To select a different host/port, specify that host/port in a firebase.json config file:
      {
        // ...
        "emulators": {
          "${emuLogger.name}": {
            "host": "${clc.yellow("HOST")}",
            "port": "${clc.yellow("PORT")}"
          }
        }
      }`,
    );
  }
  return utils.reject(`Could not start ${description}, port taken.`, {});
}

function listenSpec(lookup: dns.LookupAddress, port: number): ListenSpec {
  if (lookup.family !== 4 && lookup.family !== 6) {
    throw new Error(`Unsupported address family "${lookup.family}" for address ${lookup.address}.`);
  }
  return {
    address: lookup.address,
    family: lookup.family === 4 ? "IPv4" : "IPv6",
    port: port,
  };
}
