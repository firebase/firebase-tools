import { AuthClient } from "google-auth-library";
import { GaxiosOptions, GaxiosPromise, GaxiosResponse } from "gaxios";

import * as apiv2 from "../../apiv2";
import * as auth from "../../auth";
import { FirebaseError } from "../../error";

const pkg = require("../../../package.json");
const CLI_VERSION: string = pkg.version;

// FBToolsAuthClient implements google-auth-library.AuthClient
// using apiv2.ts and our normal OAuth2 flow.
export class FBToolsAuthClient extends AuthClient {
  public async request<T>(opts: GaxiosOptions): GaxiosPromise<T> {
    if (!opts.url) {
      throw new FirebaseError("opts.url was undefined");
    }
    const url = new URL(opts.url);
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
    // Runtime fetch of Auth singleton to prevent circular module dependencies
    if (apiv2.accessToken) {
      return { token: apiv2.accessToken };
    }
    const data = await auth.getAccessToken(apiv2.refreshToken, []);
    return { token: data.access_token };
  }

  public async getRequestHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken();
    return {
      Connection: "keep-alive",
      "User-Agent": `FirebaseCLI/${CLI_VERSION}`,
      "X-Client-Version": `FirebaseCLI/${CLI_VERSION}`,
      Authorization: `Bearer ${token.token}`,
    };
  }
}
