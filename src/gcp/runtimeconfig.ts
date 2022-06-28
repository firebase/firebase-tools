/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as _ from "lodash";

import { runtimeconfigOrigin } from "../api";
import { Client } from "../apiv2";
import { logger } from "../logger";

const API_VERSION = "v1beta1";
const apiClient = new Client({ urlPrefix: runtimeconfigOrigin, apiVersion: API_VERSION });

function listConfigs(projectId: string): Promise<unknown[] | undefined> {
  return apiClient
    .get<{ configs?: unknown[] }>(`/projects/${projectId}/configs`, {
      retryCodes: [500, 503],
    })
    .then((resp) => resp.body.configs);
}

function createConfig(projectId: string, configId: string): Promise<any> {
  const path = ["projects", projectId, "configs"].join("/");
  return apiClient
    .post(
      `/projects/${projectId}/configs`,
      {
        name: path + "/" + configId,
      },
      {
        retryCodes: [500, 503],
      }
    )
    .catch((err) => {
      if (_.get(err, "context.response.statusCode") === 409) {
        // Config has already been created as part of a parallel operation during firebase functions:config:set
        return Promise.resolve();
      }
      return Promise.reject(err);
    });
}

function deleteConfig(projectId: string, configId: string): Promise<any> {
  return apiClient
    .delete(`/projects/${projectId}/configs/${configId}`, {
      retryCodes: [500, 503],
    })
    .catch((err) => {
      if (_.get(err, "context.response.statusCode") === 404) {
        logger.debug("Config already deleted.");
        return Promise.resolve();
      }
      throw err;
    });
}

function listVariables(configPath: string): Promise<any> {
  return apiClient
    .get<{ variables: any }>(`${configPath}/variables`, {
      retryCodes: [500, 503],
    })
    .then((resp) => {
      return Promise.resolve(resp.body.variables);
    });
}

function getVariable(varPath: string): Promise<any> {
  return apiClient
    .get(varPath, {
      retryCodes: [500, 503],
    })
    .then((resp) => {
      return Promise.resolve(resp.body);
    });
}

function createVariable(
  projectId: string,
  configId: string,
  varId: string,
  value: any
): Promise<any> {
  const path = `/projects/${projectId}/configs/${configId}/variables`;
  return apiClient
    .post(
      path,
      {
        name: `${path}/${varId}`,
        text: value,
      },
      {
        retryCodes: [500, 503],
      }
    )
    .catch((err) => {
      if (_.get(err, "context.response.statusCode") === 404) {
        // parent config doesn't exist yet
        return createConfig(projectId, configId).then(() => {
          return createVariable(projectId, configId, varId, value);
        });
      }
      return Promise.reject(err);
    });
}

function updateVariable(
  projectId: string,
  configId: string,
  varId: string,
  value: any
): Promise<any> {
  const path = `/projects/${projectId}/configs/${configId}/variables/${varId}`;
  return apiClient.put(
    path,
    {
      name: path,
      text: value,
    },
    {
      retryCodes: [500, 503],
    }
  );
}

function setVariable(projectId: string, configId: string, varId: string, value: any): Promise<any> {
  const path = ["projects", projectId, "configs", configId, "variables", varId].join("/");
  return getVariable(path)
    .then(() => {
      return updateVariable(projectId, configId, varId, value);
    })
    .catch((err) => {
      if (_.get(err, "context.response.statusCode") === 404) {
        return createVariable(projectId, configId, varId, value);
      }
      return Promise.reject(err);
    });
}

function deleteVariable(projectId: string, configId: string, varId: string): Promise<any> {
  return apiClient
    .delete(`/projects/${projectId}/configs/${configId}/variables/${varId}`, {
      retryCodes: [500, 503],
      queryParams: { recursive: "true" },
    })
    .catch((err) => {
      if (_.get(err, "context.response.statusCode") === 404) {
        logger.debug("Variable already deleted.");
        return Promise.resolve();
      }
      return Promise.reject(err);
    });
}

export const configs = {
  list: listConfigs,
  create: createConfig,
  delete: deleteConfig,
};
export const variables = {
  list: listVariables,
  get: getVariable,
  set: setVariable,
  delete: deleteVariable,
};
