import fetch from "node-fetch";

/**
 * Execution service.
 */
export class ExecutionService {
  // TODO: remove hardcoded endpoint
  async execute(params: { operationName?: String; query: String }) {
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
}
