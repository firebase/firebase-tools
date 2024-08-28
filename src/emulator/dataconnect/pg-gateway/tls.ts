import type { Socket } from 'node:net';
import {
  TLSSocket,
  type TLSSocketOptions,
  createSecureContext,
} from 'node:tls';
import type { TlsOptions, TlsOptionsCallback } from './connection';
import type { TlsInfo } from './connection.types.js';

export async function upgradeTls(
  socket: Socket,
  options: TlsOptions | TlsOptionsCallback,
  tlsInfo: TlsInfo = {},
  requestCert = false,
): Promise<{ secureSocket: TLSSocket; tlsInfo: TlsInfo }> {
  const originalSocket = socket;
  originalSocket.pause();

  const tlsSocketOptions = await createTlsSocketOptions(
    options,
    tlsInfo,
    requestCert,
  );

  const secureSocket = new TLSSocket(originalSocket, {
    ...tlsSocketOptions,
    isServer: true,
    SNICallback: async (sniServerName, callback) => {
      tlsInfo.sniServerName = sniServerName;
      const updatedTlsSocketOptions = await createTlsSocketOptions(
        options,
        tlsInfo,
        requestCert,
      );
      callback(null, createSecureContext(updatedTlsSocketOptions));
    },
  });

  secureSocket.pause();

  await new Promise<void>((resolve) => {
    secureSocket.on('secure', () => {
      onServerSocketSecure(secureSocket);
      resolve();
    });
  });

  originalSocket.resume();

  return { secureSocket, tlsInfo };
}

async function createTlsSocketOptions(
  optionsOrCallback: TlsOptions | TlsOptionsCallback,
  tlsInfo: TlsInfo,
  requestCert: boolean,
): Promise<TLSSocketOptions> {
  const { key, cert, ca, passphrase } =
    typeof optionsOrCallback === 'function'
      ? await optionsOrCallback(tlsInfo)
      : optionsOrCallback;

  return {
    key,
    cert,
    ca,
    passphrase,
    requestCert,
  };
}

/**
 * Internal Node.js handler copied and modified from source to validate client certs.
 * https://github.com/nodejs/node/blob/aeaffbb385c9fc756247e6deaa70be8eb8f59496/lib/_tls_wrap.js#L1185-L1203
 *
 * Without this, `authorized` is always `false` on the TLSSocket and we never know if the client cert is valid.
 */
// biome-ignore lint/suspicious/noExplicitAny: <explanation>
function onServerSocketSecure(secureSocket: TLSSocket & any) {
  if (secureSocket._requestCert) {
    const verifyError = secureSocket._handle.verifyError();
    if (verifyError) {
      secureSocket.authorizationError = verifyError.code;
    } else {
      secureSocket.authorized = true;
    }
  }
}
