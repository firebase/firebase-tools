import type { Socket } from 'node:net';
import { Duplex, Readable, Writable } from 'node:stream';
import PostgresConnection, { type PostgresConnectionOptions } from '../../connection';

/**
 * Creates a `PostgresConnection` from a Node.js TCP/Unix `Socket`.
 *
 * `PostgresConnection` operates on web streams, so this helper
 * converts a `Socket` to/from the respective web streams.
 *
 * Also implements `upgradeTls()`, which makes Postgres `SSLRequest`
 * upgrades available in Node.js environments.
 */
export async function fromNodeSocket(socket: Socket, options?: PostgresConnectionOptions) {
  // Duplex.toWeb(socket);
  const rs = Readable.toWeb(socket);
  const ws = Writable.toWeb(socket);
  const opts = options
    ? {
        ...options,
      }
    : undefined;

  return new PostgresConnection({ readable: rs, writable: ws}, opts);
}
