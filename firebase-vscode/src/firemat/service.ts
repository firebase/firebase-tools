import fetch from "node-fetch";
import { IntrospectionQuery, getIntrospectionQuery } from "graphql";
import { Signal } from "@preact/signals-core";

/**
 * Firemat Emulator service
 */
export class FirematService {
  constructor(private firematEndpoint: Signal<string | undefined>) {}

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
            "Failed to connect to the emulator. Did you forget to start it?"
          )
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
      for (let type of introspectionResults.data.__schema.types) {
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
        }
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
        body: body,
      }
    );
    const result = await resp.json().catch(() => resp.text());
    return result;
  }
}
