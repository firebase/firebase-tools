import fetch, { Response } from "node-fetch";
import {
  ExecutionResult,
  IntrospectionQuery,
  getIntrospectionQuery,
} from "graphql";
import { Signal, computed, signal } from "@preact/signals-core";
import { assertExecutionResult } from "../../common/graphql";
import { FirematError } from "../../common/error";
import { AuthService } from "../auth/service";
import { UserMockKind } from "../../common/messaging/protocol";
import { firstWhereDefined } from "../utils/signal";
import { EmulatorsController } from "../core/emulators";
import { Emulators } from "../cli";

/**
 * Firemat Emulator service
 */
export class FirematService {
  constructor(
    private authService: AuthService,
    private emulatorsController: EmulatorsController,
  ) {}

  readonly endpoint = computed<string | undefined>(() => {
    const emulatorInfos =
      this.emulatorsController.emulators.value.infos?.displayInfo;
    const firematEmulator = emulatorInfos?.find(
      (emulatorInfo) => emulatorInfo.name === Emulators.DATACONNECT,
    );

    if (!firematEmulator) {
      return undefined;
    }

    return "http://" + firematEmulator.host + ":" + firematEmulator.port;
  });

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
    if (userMock.kind === UserMockKind.ADMIN) {
      return {};
    }
    return {
      impersonate:
        userMock.kind === UserMockKind.AUTHENTICATED
          ? { authClaims: JSON.parse(userMock.claims) }
          : { unauthenticated: true },
    };
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
      if ((introspectionResults as any).errors.length > 0) {
        return { data: undefined };
      }
      // TODO: remove after core server handles this
      for (let type of (introspectionResults as any).data.__schema.types) {
        type.interfaces = [];
      }

      return { data: (introspectionResults as any).data };
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
        extensions: this._auth(),
      });
      const resp = await fetch(
        (await firstWhereDefined(this.endpoint)) +
          "/v1/projects/p/locations/l/services/local:executeGraphqlRead",
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
      extensions: this._auth(),
    });
    const resp = await fetch(
      (await firstWhereDefined(this.endpoint)) +
        "/v1/projects/p/locations/l/services/local:executeGraphql",
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
