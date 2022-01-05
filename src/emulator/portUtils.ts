import * as pf from "portfinder";
import * as tcpport from "tcp-port-used";

import { FirebaseError } from "../error";
import { logger } from "../logger";

// See:
// - https://stackoverflow.com/questions/4313403/why-do-browsers-block-some-ports
// - https://chromium.googlesource.com/chromium/src.git/+/refs/heads/master/net/base/port_util.cc
const RESTRICTED_PORTS = [
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
];

/**
 * Check if a given port is restricted by Chrome.
 */
export function isRestricted(port: number): boolean {
  return RESTRICTED_PORTS.includes(port);
}

/**
 * Suggest a port equal to or higher than the given port which is not restricted by Chrome.
 */
export function suggestUnrestricted(port: number): number {
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
 * Find an available (unused) port on the given host.
 * @param host the host.
 * @param start the lowest port to search.
 * @param avoidRestricted when true (default) ports which are restricted by Chrome are excluded.
 */
export async function findAvailablePort(
  host: string,
  start: number,
  avoidRestricted = true
): Promise<number> {
  const openPort = await pf.getPortPromise({ host, port: start });

  if (avoidRestricted && isRestricted(openPort)) {
    logger.debug(`portUtils: skipping restricted port ${openPort}`);
    return findAvailablePort(host, suggestUnrestricted(openPort), avoidRestricted);
  }

  return openPort;
}

/**
 * Check if a port is open on the given host.
 */
export async function checkPortOpen(port: number, host: string): Promise<boolean> {
  try {
    const inUse = await tcpport.check(port, host);
    return !inUse;
  } catch (e: any) {
    logger.debug(`port check error: ${e}`);
    return false;
  }
}

/**
 * Wait for a port to close on the given host. Checks every 250ms for up to 30s.
 */
export async function waitForPortClosed(port: number, host: string): Promise<void> {
  const interval = 250;
  const timeout = 60000;
  try {
    await tcpport.waitUntilUsedOnHost(port, host, interval, timeout);
  } catch (e: any) {
    throw new FirebaseError(`TIMEOUT: Port ${port} on ${host} was not active within ${timeout}ms`);
  }
}
