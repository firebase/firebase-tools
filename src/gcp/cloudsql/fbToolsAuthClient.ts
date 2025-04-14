import { AuthClient } from "google-auth-library";
import { GaxiosOptions, GaxiosPromise, GaxiosResponse } from "gaxios";

import * as apiv2 from "../../apiv2";
import { FirebaseError } from "../../error";

// FBToolsAuthClient implements google-auth-library.AuthClient
// using apiv2.ts and our normal OAuth2 flow.
export class FBToolsAuthClient extends AuthClient {
  public async request<T>(opts: GaxiosOptions): GaxiosPromise<T> {
    if (!opts.url) {
      throw new FirebaseError("opts.url was undefined");
    }
    const url = new URL(opts.url as string);
    const client = new apiv2.Client({
      urlPrefix: url.origin,
      auth: true,
    });
    const res = await client.request<T, any>({
      method: opts.method ?? "POST",
      path: url.pathname,
      queryParams: opts.params,
      body: opts.data,
      responseType: opts.responseType,
    });
    return {
      config: opts,
      status: res.status,
      statusText: res.response.statusText,
      data: res.body,
      headers: res.response.headers,
      request: {} as any,
    };
  }
  public async getAccessToken(): Promise<{ token?: string; res?: GaxiosResponse<any> }> {
    return { token: await apiv2.getAccessToken() };
  }

  public async getRequestHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      ...apiv2.STANDARD_HEADERS,
      Authorization: `Bearer ${token.token}`,
    };
  }
}
