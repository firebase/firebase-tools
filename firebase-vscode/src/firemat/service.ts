import fetch, { Response } from "node-fetch";
import {
  ExecutionResult,
  IntrospectionQuery,
  getIntrospectionQuery,
} from "graphql";
import { Signal } from "@preact/signals-core";
import { assertExecutionResult } from "../../common/graphql";
import { FirematError } from "../../common/error";
import { AuthService } from "../auth/service";

/**
 * Firemat Emulator service
 */
export class FirematService {
  constructor(
    private firematEndpoint: Signal<string | undefined>,
    private authService: AuthService,
  ) {}

  private async decodeResponse(
    response: Response,
    format?: "application/json",
  ): Promise<unknown> {
    const contentType = response.headers.get("Content-Type");
    if (!contentType) {
      throw new Error("Invalid content type");
    }

    if (format && !contentType.includes(format)) {
      throw new Error(
        `Invalid content type. Expected ${format} but got ${contentType}`,
      );
    }

    if (contentType.includes("application/json")) {
      return response.json();
    }

    return response.text();
  }

  private async handleValidResponse(
    response: Response,
  ): Promise<ExecutionResult> {
    const json = await this.decodeResponse(response, "application/json");
    assertExecutionResult(json);

    return json;
  }

  private async handleInvalidResponse(response: Response): Promise<never> {
    const cause = await this.decodeResponse(response);

    throw new FirematError(
      `Request failed with status ${response.status}`,
      cause,
    );
  }

  private handleResponse(response: Response): Promise<ExecutionResult> {
    if (response.status >= 200 && response.status < 300) {
      return this.handleValidResponse(response);
    }

    return this.handleInvalidResponse(response);
  }

  /**
   * Obtains the current Firemat endpoint.
   *
   * If the endpoint is not available, waits for it to become available.
   * This will result in waiting for the emulator to start.
   *
   * If the endpoint is not available after 30 seconds, an error is thrown.
   */
  private async getFirematEndpoint(): Promise<string> {
    let currentValue = this.firematEndpoint.value;
    if (currentValue) {
      return currentValue;
    }

    return new Promise((resolve, reject) => {
      let timeout: NodeJS.Timeout;
      let unsubscribe: () => void;

      function cleanup() {
        clearTimeout(timeout);
        unsubscribe();
      }

      timeout = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            "Failed to connect to the emulator. Did you forget to start it?",
          ),
        );
      }, 30 * 1000);

      unsubscribe = this.firematEndpoint.subscribe((value) => {
        if (value !== undefined) {
          resolve(value);
          cleanup();
        }
      });
    });
  }

  /** Encode a body while handling the fact that "variables" is raw JSON.
   *
   * If the JSON is invalid, will throw.
   */
  private _serializeBody(body: { variables?: string; [key: string]: unknown }) {
    if (!body.variables) {
      return JSON.stringify(body);
    }

    // TODO: make this more efficient than a plain JSON decode+encode.
    const { variables, ...rest } = body;

    return JSON.stringify({
      ...rest,
      variables: JSON.parse(variables),
    });
  }

  private _auth() {
    const userMock = this.authService.userMock;

    // TODO(rrousselGit): handle unauthenticated case once the API supports it.
    return userMock.kind === "authenticated"
      ? JSON.parse(userMock.claims)
      : undefined;
  }

  // This introspection is used to generate a basic graphql schema
  // It will not include our predefined operations, which requires a Firemat specific introspection query
  async introspect(): Promise<{ data?: IntrospectionQuery }> {
    try {
      const introspectionResults = await this.executeGraphQLRead({
        query: getIntrospectionQuery(),
        operationName: "IntrospectionQuery",
        variables: "{}",
      });
      console.log("introspection: ", introspectionResults);
      // TODO: handle errors
      if (introspectionResults.errors.length > 0) {
        return { data: undefined };
      }
      // TODO: remove after core server handles this
      for (let type of (introspectionResults.data as any).__schema.types) {
        type.interfaces = [];
      }

      return { data: introspectionResults.data };
    } catch (e) {
      // TODO: surface error that emulator is not connected
      console.error("error: ", e);
      return { data: undefined };
    }
  }

  async executeGraphQLRead(params: {
    query: string;
    operationName: string;
    variables: string;
  }) {
    try {
      // TODO: get name programmatically
      const body = this._serializeBody({
        ...params,
        name: "projects/p/locations/l/services/local",
        auth: this._auth(),
      });
      const resp = await fetch(
        (await this.getFirematEndpoint()) +
          "/v0/projects/p/locations/l/services/local:executeGraphqlRead",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-mantle-admin": "all",
          },
          body,
        },
      );
      const result = await resp.json().catch(() => resp.text());
      return result;
    } catch (e) {
      // TODO: actual error handling
      console.log(e);
      return null;
    }
  }

  async executeGraphQL(params: {
    query: string;
    operationName?: string;
    variables: string;
  }) {
    // TODO: get name programmatically
    const body = this._serializeBody({
      ...params,
      name: "projects/p/locations/l/services/local",
      auth: this._auth(),
    });
    const resp = await fetch(
      (await this.getFirematEndpoint()) +
        "/v0/projects/p/locations/l/services/local:executeGraphql",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-mantle-admin": "all",
        },
        body,
      },
    );

    return this.handleResponse(resp);
  }
}
