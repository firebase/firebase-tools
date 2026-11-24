import { AuthClient } from "google-auth-library";
import { GaxiosOptions, GaxiosOptionsPrepared, GaxiosPromise, GaxiosResponse } from "gaxios";

import * as apiv2 from "../../apiv2";
import { FirebaseError } from "../../error";

// FBToolsAuthClient implements google-auth-library.AuthClient
// using apiv2.ts and our normal OAuth2 flow.
export class FBToolsAuthClient extends AuthClient {
  public async request<T>(opts: GaxiosOptions): GaxiosPromise<T> {
    if (!opts.url) {
      throw new FirebaseError("opts.url was undefined");
    }
    const url = opts.url instanceof URL ? opts.url : new URL(opts.url);
    const client = new apiv2.Client({
      urlPrefix: url.origin,
      auth: true,
    });
    const res = await client.request<unknown, T>({
      method: (opts.method ?? "POST") as apiv2.HttpMethod,
      path: url.pathname,
      queryParams: opts.params,
      body: opts.data ?? undefined,
      responseType: opts.responseType,
    });
    const preparedConfig: GaxiosOptionsPrepared = {
      ...opts,
      headers: new Headers(opts.headers),
      url,
    };
    const headers = new Headers();
    res.response.headers.forEach((value, name) => {
      headers.append(name, value);
    });
    const response = new Response(undefined, {
      status: res.status,
      statusText: res.response.statusText,
      headers,
    });
    return Object.assign(response, {
      config: preparedConfig,
      data: res.body,
    });
  }

  public async getAccessToken(): Promise<{ token?: string; res?: GaxiosResponse<unknown> }> {
    return { token: await apiv2.getAccessToken() };
  }

  public async getRequestHeaders(): Promise<Headers> {
    const token = await this.getAccessToken();
    return new Headers({
      ...apiv2.standardHeaders(),
      Authorization: `Bearer ${token.token}`,
    });
  }
}
