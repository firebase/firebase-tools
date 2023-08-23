import fetch from "node-fetch";
import { buildSchema, introspectionFromSchema } from "graphql";
import { effect, signal } from "@preact/signals-core";
import { ExtensionBrokerImpl } from "../extension-broker";

/**
 * Firemat Emulator service
 */
export class FirematService {
  private firematEndpoint = signal("http://127.0.0.1:9399");

  constructor(private broker: ExtensionBrokerImpl) {
    effect(() => {
      broker.on("notifyFirematEmulatorEndpoint", ({ endpoint }) => {
        this.firematEndpoint.value = endpoint;
      });
    });
  }

  async executeMutation(params: {
    operation_name: String;
    mutation: String;
    variables: {};
  }) {
    // TODO: get operationSet name from firemat.yaml
    const body = { ...params, name: "projects/p/locations/l/services/s/operationSets/app/revisions/r" };
    const resp = await fetch(this.firematEndpoint + "/v0/projects/p/locations/l/services/s/operationSets/app/revisions/r:executeMutation", {
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
    const resp = await fetch(this.firematEndpoint + "/v0/projects/p/locations/l/services/s/operationSets/app/revisions/r:executeQuery", {
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

  // TODO: use emulator endpoints
  async introspect() {
    try {
      const resp = await fetch("http://127.0.0.1:8989/__/schema.gql");
      const text = await resp.text();
      const introspection = introspectionFromSchema(buildSchema(text));
      return { data: introspection };
    } catch (e) {
      // TODO: surface error that emulator is not connected
      console.error("error: ", e);
      return { data: null };
    }
  }
}
