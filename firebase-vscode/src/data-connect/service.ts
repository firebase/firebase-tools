import fetch, { Response } from "node-fetch";
import {
  ExecutionResult,
  IntrospectionQuery,
  getIntrospectionQuery,
} from "graphql";
import { computed } from "@preact/signals-core";
import { assertExecutionResult } from "../../common/graphql";
import { DataConnectError } from "../../common/error";
import { AuthService } from "../auth/service";
import { UserMockKind } from "../../common/messaging/protocol";
import { firstWhereDefined } from "../utils/signal";
import { EmulatorsController } from "../core/emulators";
import { Emulators } from "../cli";
import { dataConnectConfigs } from "../data-connect/config";

import { firebaseRC } from "../core/config";
import { executeGraphQL } from "../../../src/dataconnect/dataplaneClient";
import {
  ExecuteGraphqlRequest,
  ExecuteGraphqlResponse,
  ExecuteGraphqlResponseError,
  Impersonation,
} from "../dataconnect/types";
import { ClientResponse } from "../apiv2";
import { InstanceType } from "./code-lens-provider";
import { pluginLogger } from "../logger-wrapper";

/**
 * DataConnect Emulator service
 */
export class DataConnectService {
  constructor(
    private authService: AuthService,
    private emulatorsController: EmulatorsController,
  ) {}

  async servicePath(
    path: string,
    instance: InstanceType,
  ): Promise<string | undefined> {
    const dataConnectConfigsValue = await firstWhereDefined(dataConnectConfigs);
    // TODO: avoid calling this here and in getApiServicePathByPath
    const serviceId =
      dataConnectConfigsValue?.tryReadValue.findEnclosingServiceForPath(path)
        .value.serviceId;
    const projectId = firebaseRC.value?.tryReadValue?.projects?.default;

    if (serviceId === undefined || projectId === undefined) {
      return undefined;
    }

    return (
      dataConnectConfigsValue?.tryReadValue?.getApiServicePathByPath(
        projectId,
        path,
      ) || `projects/p/locations/l/services/${serviceId}`
    );
  }

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
  private async handleProdResponse(
    clientResponse: ClientResponse<
      ExecuteGraphqlResponse | ExecuteGraphqlResponseError
    >,
  ): Promise<ExecutionResult> {
    if (!(clientResponse.status >= 200 && clientResponse.status < 300)) {
      const errorResponse =
        clientResponse as ClientResponse<ExecuteGraphqlResponseError>;
      throw new DataConnectError(
        `Request failed with status ${clientResponse.status}`,
        errorResponse.body.error.message,
      );
    }
    const successResponse =
      clientResponse as ClientResponse<ExecuteGraphqlResponse>;
    return successResponse.body;
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

    throw new DataConnectError(
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
    if (!body.variables || body.variables.trim().length === 0) {
      body.variables = undefined;
      return JSON.stringify(body);
    }

    // TODO: make this more efficient than a plain JSON decode+encode.
    const { variables, ...rest } = body;

    return JSON.stringify({
      ...rest,
      variables: JSON.parse(variables),
    });
  }

  private _auth(): { impersonate?: Impersonation } {
    const userMock = this.authService.userMock;
    if (!userMock || userMock.kind === UserMockKind.ADMIN) {
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
  // It will not include our predefined operations, which requires a DataConnect specific introspection query
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
      pluginLogger.error("error: ", e);
      return { data: undefined };
    }
  }

  async executeGraphQLRead(params: {
    query: string;
    operationName: string;
    variables: string;
  }) {
    // TODO: get introspections for all services
    const configs = await firstWhereDefined(dataConnectConfigs);
    // Using "requireValue", so that if configs are not available, the execution should throw.
    const serviceId = configs.requireValue.serviceIds[0];
    try {
      // TODO: get name programmatically
      const body = this._serializeBody({
        ...params,
        name: `projects/p/locations/l/services/${serviceId}`,
        extensions: {}, // Introspection is the only caller of executeGraphqlRead
      });
      const resp = await fetch(
        (await firstWhereDefined(this.emulatorsController.getLocalEndpoint())) +
          `/v1alpha/projects/p/locations/l/services/${serviceId}:executeGraphqlRead`,
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
      pluginLogger.error(e);
      return null;
    }
  }

  async executeGraphQL(params: {
    query: string;
    operationName?: string;
    variables: string;
    path: string;
    instance: InstanceType;
  }) {
    const servicePath = await this.servicePath(params.path, params.instance);
    if (!servicePath) {
      throw new Error("No service found for path: " + params.path);
    }

    const prodBody: ExecuteGraphqlRequest = {
      operationName: params.operationName,
      variables: JSON.parse(params.variables),
      query: params.query,
      name: `${servicePath}`,
      extensions: this._auth(),
    };

    const body = this._serializeBody({
      ...params,
      name: `${servicePath}`,
      extensions: this._auth(),
    });
    if (params.instance === InstanceType.PRODUCTION) {
      const resp = await executeGraphQL(servicePath, prodBody);
      return this.handleProdResponse(resp);
    } else {
      const resp = await fetch(
        (await firstWhereDefined(this.emulatorsController.getLocalEndpoint())) +
          `/v1alpha/${servicePath}:executeGraphql`,
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

  async connectToPostgres(connectionString: string): Promise<boolean> {
    try {
      await fetch(
        firstWhereDefined(this.emulatorsController.getLocalEndpoint()) +
          `/emulator/configure?connectionString=${connectionString}`,
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-mantle-admin": "all",
          },
        },
      );
      return true;
    } catch (e: any) {
      pluginLogger.error(e);
      return false;
    }
  }
}
