import fetch, { Response } from "node-fetch";
import {
  ExecutionResult,
  IntrospectionQuery,
  getIntrospectionQuery,
} from "graphql";
import { DataConnectError } from "../../common/error";
import { AuthService } from "../auth/service";
import { UserMockKind } from "../../common/messaging/protocol";
import { firstWhereDefined } from "../utils/signal";
import { EmulatorsController } from "../core/emulators";
import { dataConnectConfigs } from "../data-connect/config";

import { firebaseRC } from "../core/config";
import {
  dataconnectDataplaneClient,
  dataconnectOrigin,
  executeGraphQL,
  DATACONNECT_API_VERSION,
} from "../../../src/dataconnect/dataplaneClient";
import {
  ExecuteGraphqlRequest,
  ExecuteGraphqlResponse,
  ExecuteGraphqlResponseError,
  Impersonation,
} from "../dataconnect/types";
import { Client, ClientResponse } from "../../../src/apiv2";
import { InstanceType } from "./code-lens-provider";
import { pluginLogger } from "../logger-wrapper";
import { DataConnectToolkit } from "./toolkit";

/**
 * DataConnect Emulator service
 */
export class DataConnectService {
  constructor(
    private authService: AuthService,
    private dataConnectToolkit: DataConnectToolkit,
    private emulatorsController: EmulatorsController,
  ) {}

  async servicePath(
    path: string
  ): Promise<string | undefined> {
    const dataConnectConfigsValue = await firstWhereDefined(dataConnectConfigs);
    // TODO: avoid calling this here and in getApiServicePathByPath
    const serviceId =
      dataConnectConfigsValue?.tryReadValue?.findEnclosingServiceForPath(path)?.value.serviceId;
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
    response: ClientResponse<
      ExecuteGraphqlResponse | ExecuteGraphqlResponseError
    >,
  ): Promise<ExecutionResult> {
    if (!(response.status >= 200 && response.status < 300)) {
      const errorResponse =
        response as ClientResponse<ExecuteGraphqlResponseError>;
      throw new DataConnectError(
        `Prod Request failed with status ${response.status}\nMessage ${errorResponse?.body?.error?.message}`,
      );
    }
    const successResponse = response as ClientResponse<ExecuteGraphqlResponse>;
    return successResponse.body;
  }

  private async handleEmulatorResponse(
    response: ClientResponse<
      ExecuteGraphqlResponse | ExecuteGraphqlResponseError
    >,
  ): Promise<ExecutionResult> {
    if (!(response.status >= 200 && response.status < 300)) {
      const errorResponse =
        response as ClientResponse<ExecuteGraphqlResponseError>;
      throw new DataConnectError(
        `Emulator Request failed with status ${response.status}\nMessage ${errorResponse?.body?.error?.message}`,
      );
    }
    const successResponse = response as ClientResponse<ExecuteGraphqlResponse>;
    return successResponse.body;
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
    const serviceId = configs.requireValue?.serviceIds[0];
    try {
      // TODO: get name programmatically
      const body = this._serializeBody({
        ...params,
        name: `projects/p/locations/l/services/${serviceId}`,
        extensions: {}, // Introspection is the only caller of executeGraphqlRead
      });
      const resp = await fetch(
        (await this.dataConnectToolkit.getFDCToolkitURL()) +
          `/v1/projects/p/locations/l/services/${serviceId}:executeGraphqlRead`,
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
    const servicePath = await this.servicePath(params.path);
    if (!servicePath) {
      throw new Error("No service found for path: " + params.path);
    }
    const prodBody: ExecuteGraphqlRequest = {
      operationName: params.operationName,
      variables: parseVariableString(params.variables),
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
      const client = dataconnectDataplaneClient();
      pluginLogger.info(`ExecuteGraphQL (${dataconnectOrigin()}) request: ${JSON.stringify(prodBody, undefined, 4)}`);
      const resp = await executeGraphQL(client, servicePath, prodBody);
      return this.handleProdResponse(resp);
    } else {
      const endpoint = this.emulatorsController.getLocalEndpoint();
      if (!endpoint) {
        throw new DataConnectError(
          `Emulator isn't running. Please start your emulator!`,
        );
      }
      const client = new Client({
        urlPrefix: endpoint,
        apiVersion: DATACONNECT_API_VERSION,
      });
      const resp = await executeGraphQL(client, servicePath, prodBody);
      return this.handleEmulatorResponse(resp);
    }
  }

  docsLink() {
    return this.dataConnectToolkit.getGeneratedDocsURL();
  }
}

function parseVariableString(variables: string): Record<string, any> {
  if (!variables) {
    return {};
  }
  try {
    return JSON.parse(variables);
  } catch(e: any) {
    throw new Error(
      "Unable to parse variables as JSON. Double check that that there are no unmatched braces or quotes, or unqouted keys in the variables pane."
    );
  }
}
