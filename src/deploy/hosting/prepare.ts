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

import { FirebaseError } from "../../error";
import { client } from "./client";
import { needProjectNumber } from "../../projectUtils";
import { normalizedHostingConfigs } from "../../hosting/normalizedHostingConfigs";
import { validateDeploy } from "./validate";
import { convertConfig } from "./convertConfig";
import * as deploymentTool from "../../deploymentTool";
import { Payload } from "./args";

/**
 *  Prepare creates versions for each Hosting site to be deployed.
 */
export async function prepare(context: any, options: any, payload: Payload): Promise<void> {
  // Allow the public directory to be overridden by the --public flag
  if (options.public) {
    if (Array.isArray(options.config.get("hosting"))) {
      throw new FirebaseError("Cannot specify --public option with multi-site configuration.");
    }

    options.config.set("hosting.public", options.public);
  }

  const projectNumber = await needProjectNumber(options);

  const configs = normalizedHostingConfigs(options, { resolveTargets: true });
  if (configs.length === 0) {
    return Promise.resolve();
  }

  context.hosting = {
    deploys: configs.map((cfg) => {
      return { config: cfg, site: cfg.site };
    }),
  };

  const versionCreates: unknown[] = [];

  for (const deploy of context.hosting.deploys) {
    const cfg = deploy.config;

    validateDeploy(deploy, options);

    const data = {
      config: await convertConfig(context, payload, cfg, false),
      labels: deploymentTool.labels(),
    };

    versionCreates.push(
      client
        .post<{ config: unknown; labels: { [k: string]: string } }, { name: string }>(
          `/projects/${projectNumber}/sites/${deploy.site}/versions`,
          data
        )
        .then((res) => {
          deploy.version = res.body.name;
        })
    );
  }

  await Promise.all(versionCreates);
}
