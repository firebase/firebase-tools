import fetch from "node-fetch";
import { ExtensionContext } from "vscode";
import {
  ExecutionResult,
  IntrospectionQuery,
  getIntrospectionQuery,
} from "graphql";
import { DataConnectError } from "../../common/error";
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
  GraphqlResponse,
  GraphqlResponseError,
} from "../dataconnect/types";
import { Client, ClientResponse } from "../../../src/apiv2";
import { InstanceType } from "./code-lens-provider";
import { pluginLogger } from "../logger-wrapper";
import { DataConnectToolkit } from "./toolkit";
import { AnalyticsLogger, DATA_CONNECT_EVENT_NAME } from "../analytics";
import { ExecutionParamsService } from "./execution/execution-params";

/**
 * DataConnect Emulator service
 */
export class DataConnectService {
  constructor(
    private dataConnectToolkit: DataConnectToolkit,
    private emulatorsController: EmulatorsController,
    private analyticsLogger: AnalyticsLogger,
  ) {}

  async servicePath(path: string): Promise<string> {
    const dataConnectConfigsValue = await firstWhereDefined(dataConnectConfigs);
    // TODO: avoid calling this here and in getApiServicePathByPath
    const dcs = dataConnectConfigsValue?.tryReadValue;
    if (!dcs) {
      throw new Error("cannot find dataconnect.yaml in the project");
    }
    const projectId = firebaseRC.value?.tryReadValue?.projects?.default;
    return dcs?.getApiServicePathByPath(projectId, path);
  }

  private async handleProdResponse(
    response: ClientResponse<GraphqlResponse | GraphqlResponseError>,
  ): Promise<ExecutionResult> {
    this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.RUN_PROD + `_${response.status}`);
    if (!(response.status >= 200 && response.status < 300)) {
      const errorResponse = response as ClientResponse<GraphqlResponseError>;
      throw new DataConnectError(
        `Prod Request failed with status ${response.status}\nError Response: ${JSON.stringify(errorResponse?.body)}`,
      );
    }
    const successResponse = response as ClientResponse<GraphqlResponse>;
    return successResponse.body;
  }

  private async handleEmulatorResponse(
    response: ClientResponse<GraphqlResponse | GraphqlResponseError>,
  ): Promise<ExecutionResult> {
    this.analyticsLogger.logger.logUsage(DATA_CONNECT_EVENT_NAME.RUN_LOCAL + `_${response.status}`);
    if (!(response.status >= 200 && response.status < 300)) {
      const errorResponse = response as ClientResponse<GraphqlResponseError>;
      throw new DataConnectError(
        `Emulator Request failed with status ${response.status}\nError Response: ${JSON.stringify(errorResponse?.body)}`,
      );
    }
    const successResponse = response as ClientResponse<GraphqlResponse>;
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

  // This introspection is used to generate a basic graphql schema
  // It will not include our predefined operations, which requires a DataConnect specific introspection query
  async introspect(): Promise<{ data?: IntrospectionQuery }> {
    try {
      const introspectionResults = await this.executeGraphQLRead({
        query: getIntrospectionQuery(),
        operationName: "IntrospectionQuery",
        variables: "{}",
      });
      console.log("introspection result: ", introspectionResults);
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

  // Fetch the local Data Connect Schema sources via the toolkit introspection service.
  async schema(): Promise<string> {
    try {
      const res = await this.executeGraphQLRead({
        query: `query { _service { schema } }`,
        operationName: "",
        variables: "{}",
      });
      console.log("introspection schema result: ", res);
      return (res as any)?.data?._service?.schema || "";
    } catch (e) {
      // TODO: surface error that emulator is not connected
      pluginLogger.error("error: ", e);
      return "";
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

  async executeGraphQL(servicePath: string, instance: InstanceType, body: ExecuteGraphqlRequest) {
    if (instance === InstanceType.PRODUCTION) {
      const client = dataconnectDataplaneClient();
      pluginLogger.info(
        `ExecuteGraphQL (${dataconnectOrigin()}) request: ${JSON.stringify(body, undefined, 4)}`,
      );
      const resp = await executeGraphQL(client, servicePath, body);
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
      const resp = await executeGraphQL(client, servicePath, body);
      return this.handleEmulatorResponse(resp);
    }
  }

  docsLink() {
    return this.dataConnectToolkit.getGeneratedDocsURL();
  }
}
