import fetch, { Response } from "node-fetch";
import { ExecutionResult, getIntrospectionQuery } from "graphql";
import { Signal } from "@preact/signals-core";
import { assertExecutionResult } from "../../common/graphql";
import { FirematError } from "../../common/error";

/**
 * Firemat Emulator service
 */
export class FirematService {
  constructor(private firematEndpoint: Signal<string>) {}

  private async decodeResponse(
    response: Response,
    format?: "application/json"
  ): Promise<unknown> {
    const contentType = response.headers.get("Content-Type");
    if (!contentType) {
      throw new Error("Invalid content type");
    }

    if (format && !contentType.includes(format)) {
      throw new Error(
        `Invalid content type. Expected ${format} but got ${contentType}`
      );
    }

    if (contentType.includes("application/json")) {
      return response.json();
    }

    return response.text();
  }

  private async handleValidResponse(
    response: Response
  ): Promise<ExecutionResult<unknown>> {
    const json = await this.decodeResponse(response, "application/json");
    assertExecutionResult(json);

    console.log("handle valid", json);

    return json;
  }

  private async handleInvalidResponse(response: Response): Promise<never> {
    const body = await this.decodeResponse(response);

    console.log("handle error", body);

    throw new FirematError(
      `Request failed with status ${response.status}`,
      body
    );
  }

  private handleResponse(
    response: Response
  ): Promise<ExecutionResult<unknown>> {
    if (response.status >= 200 && response.status < 300) {
      return this.handleValidResponse(response);
    }

    return this.handleInvalidResponse(response);
  }

  async executeMutation(params: {
    operation_name: String;
    mutation: String;
    variables: {};
  }): Promise<ExecutionResult<unknown>> {
    // TODO: get operationSet name from firemat.yaml
    const body = {
      ...params,
      name: "projects/p/locations/l/services/local/operationSets/crud/revisions/r",
    };
    const resp = await fetch(
      this.firematEndpoint.value +
        "/v0/projects/p/locations/l/services/local/operationSets/crud/revisions/r:executeMutation",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-mantle-admin": "all",
        },
        body: JSON.stringify(body),
      }
    );

    return this.handleResponse(resp);
  }

  async executeQuery(params: {
    operation_name: String;
    query: String;
    variables: {};
  }): Promise<ExecutionResult<unknown>> {
    // TODO: get operationSet name from firemat.yaml
    const body = {
      ...params,
      name: "projects/p/locations/l/services/local/operationSets/crud/revisions/r",
    };
    const resp = await fetch(
      this.firematEndpoint.value +
        "/v0/projects/p/locations/l/services/local/operationSets/crud/revisions/r:executeQuery",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-mantle-admin": "all",
        },
        body: JSON.stringify(body),
      }
    );

    return this.handleResponse(resp);
  }

  // This introspection is used to generate a basic graphql schema
  // It will not include our predefined operations, which requires a Firemat specific introspection query
  async introspect() {
    try {
      const introspectionResults = await this.executeGraphQLRead({
        query: getIntrospectionQuery(),
        operationName: "IntrospectionQuery",
        variables: {},
      });
      console.log("introspection: ", introspectionResults);
      // TODO: handle errors
      if (introspectionResults.errors.length > 0) {
        return { data: null };
      }
      // TODO: remove after core server handles this
      for (let type of (introspectionResults.data as any).__schema.types) {
        type.interfaces = [];
      }

      return { data: introspectionResults.data };
    } catch (e) {
      // TODO: surface error that emulator is not connected
      console.error("error: ", e);
      return { data: null };
    }
  }

  async executeGraphQLRead(params: {
    query: String;
    operationName: String;
    variables: {};
  }): Promise<ExecutionResult<unknown>> {
    // TODO: get name programmatically
    const body = { ...params, name: "projects/p/locations/l/services/local" };
    const resp = await fetch(
      this.firematEndpoint.value +
        "/v0/projects/p/locations/l/services/local:executeGraphqlRead",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-mantle-admin": "all",
        },
        body: JSON.stringify(body),
      }
    );

    return this.handleResponse(resp);
  }
}
