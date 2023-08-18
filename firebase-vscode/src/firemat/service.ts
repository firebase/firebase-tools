import fetch from "node-fetch";
import { buildSchema, introspectionFromSchema } from "graphql";

/**
 * Firemat Emulator service
 */
export class FirematService {
  // TODO: use emulator endpoints
  async executeGraphQL(params: {
    operationName?: String;
    query: String;
    variables: {};
  }) {
    const resp = await fetch("http://127.0.0.1:8989/__/graphql", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-mantle-admin": "all",
      },
      body: JSON.stringify(params),
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
