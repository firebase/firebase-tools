import vscode from 'vscode';
import fetch from "node-fetch";
import { getIntrospectionQuery } from "graphql";
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
    const body = { ...params, name: "projects/p/locations/l/services/local/operationSets/crud/revisions/r" };
    const resp = await fetch(this.firematEndpoint.value + "/v0/projects/p/locations/l/services/local/operationSets/crud/revisions/r:executeMutation", {
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
    const body = { ...params, name: "projects/p/locations/l/services/local/operationSets/crud/revisions/r" };
    const resp = await fetch(this.firematEndpoint.value + "/v0/projects/p/locations/l/services/local/operationSets/crud/revisions/r:executeQuery", {
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

  // This introspection is used to generate a basic graphql schema
  // It will not include our predefined operations, which requires a Firemat specific introspection query
  async introspect() {
    try {
      const introspectionResults = await this.executeGraphQLRead({ query: getIntrospectionQuery(), operationName: "IntrospectionQuery", variables: {} });
      console.log("introspection: ", introspectionResults);
      // TODO: handle errors
      if (introspectionResults.errors.length > 0) {
        return { data: null };
      }
      // TODO: remove after core server handles this
      for (let type of introspectionResults.data.__schema.types) {
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
  }) {
    try {
      // TODO: get name programatically
      const body = { ...params, name: "projects/p/locations/l/services/local" };
      const resp = await fetch(this.firematEndpoint.value + "/v0/projects/p/locations/l/services/local:executeGraphqlRead", {
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
