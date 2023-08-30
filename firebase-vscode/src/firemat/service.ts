import fetch from "node-fetch";
import { buildSchema, introspectionFromSchema, getIntrospectionQuery } from "graphql";
import { Signal } from "@preact/signals-core";
/**
 * Firemat Emulator service
 */
export class FirematService {
  constructor(private firematEndpoint: Signal<string>) {
  }

  async executeMutation(params: {
    operation_name: String;
    mutation: String;
    variables: {};
  }) {
    // TODO: get operationSet name from firemat.yaml
    const body = { ...params, name: "projects/p/locations/l/services/s/operationSets/app/revisions/r" };
    const resp = await fetch(this.firematEndpoint.value + "/v0/projects/p/locations/l/services/s/operationSets/app/revisions/r:executeMutation", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-mantle-admin": "all",
      },
      body: JSON.stringify(body),
    });
    const result = await resp.json().catch(() => resp.text());
    return result;
  }

  async executeQuery(params: {
    operation_name: String;
    query: String;
    variables: {};
  }) {
    // TODO: get operationSet name from firemat.yaml
    const body = { ...params, name: "projects/p/locations/l/services/s/operationSets/app/revisions/r" };
    const resp = await fetch(this.firematEndpoint.value + "/v0/projects/p/locations/l/services/s/operationSets/app/revisions/r:executeQuery", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-mantle-admin": "all",
      },
      body: JSON.stringify(body),
    });
    const result = await resp.json().catch(() => resp.text());
    return result;
  }

  // TODO: use firemat specific introspectionQuery
  async introspect() {
    try {
      const resp = await this.executeGraphQLRead({ query: getIntrospectionQuery(), variables: {} });
      const introspection = introspectionFromSchema(buildSchema(resp));
      return { data: introspection };
    } catch (e) {
      // TODO: surface error that emulator is not connected
      console.error("error: ", e);
      return { data: null };
    }
  }

  async executeGraphQLRead(params: {
    query: String;
    variables: {};
  }) {
    try {
      // TODO: get name programatically
      const body = { ...params, name: "projects/p/locations/l/services/s" };
      const resp = await fetch(this.firematEndpoint.value + "/v0/projects/p/locations/l/services/s:executeGraphqlRead", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-mantle-admin": "all",
        },
        body: JSON.stringify(body),
      });
      const result = await resp.json().catch(() => resp.text());
      return result;
    }
    // TODO: actual error handling
    catch (e) {
      console.log(e);
      return null;
    }
  }
}
