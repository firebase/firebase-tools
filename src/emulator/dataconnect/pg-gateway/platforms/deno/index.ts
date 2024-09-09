import PostgresConnection, { type PostgresConnectionOptions } from '../../connection.js';

/**
 * Creates a `PostgresConnection` from a Deno TCP/Unix `Conn`.
 *
 * Note Postgres `SSLRequest` upgrades are not yet supported in Deno.
 * This feature depends on:
 * - https://github.com/denoland/deno/issues/18451
 * - https://github.com/denoland/deno/issues/23233
 */
// deno-lint-ignore require-await
export async function fromDenoConn(conn: Deno.Conn, options?: PostgresConnectionOptions) {
  return new PostgresConnection(conn, options);
}
