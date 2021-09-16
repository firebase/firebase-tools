"use strict";

import { requirePermissions } from "../requirePermissions";

const { Command } = require("../command");

import { Client, ClientResponse } from "../apiv2";
import { ensure } from "../ensureApiEnabled";
import * as responseToError from "../responseToError";
import { needProjectId } from "../projectUtils";

const compute = new Client({
  urlPrefix: "https://compute.googleapis.com/compute",
  apiVersion: "v1",
  auth: true,
});

const storage = new Client({
  urlPrefix: "https://storage.googleapis.com/storage",
  apiVersion: "v1",
  auth: true,
});

async function doesNotExist(resource: string): Promise<boolean> {
  console.log("Checking to see if", resource, "already exists...");
  const resp = await compute.get(resource, { resolveOnHTTPError: true });
  if (resp.status === 200) {
    return false;
  } else if (resp.status === 404) {
    return true;
  }

  throw responseToError({ statusCode: resp.status }, resp.body);
}

function printResp(resp: ClientResponse<any>): void {
  console.log();
  console.log("----", resp.status, "----");
  console.log(JSON.stringify(resp.body, null, 2));
  console.log("------------------------------");
  console.log();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function pollComputeOperation(projectId: string, opId: string): Promise<void> {
  const resp = await compute.get<{ status: "DONE" | "RUNNING" | "PENDING" }>(
    `projects/${projectId}/global/operations/${opId}`
  );
  if (resp.body.status === "DONE") {
    return;
  }
  await delay(2000);
  return pollComputeOperation(projectId, opId);
}

module.exports = new Command(`setup:storage:cdn [bucketId]`)
  .description(`sets up Cloud CDN for a storage bucket`)
  .before(requirePermissions, [])
  .action(async (bucketId: string | undefined, options: any) => {
    const projectId = needProjectId(options);
    bucketId = bucketId || `${projectId}.appspot.com`;
    const displayBucket = bucketId.replace(".appspot.com", "").replace(/\./g, "-");
    const labels = {
      "setup-tool": "firebase",
    };

    // TODO: check to make sure Firebase Storage bucket exists

    // 1. make the bucket public
    // TODO: Prompt for OK to make bucket public
    const iamPolicy = (
      await storage.get<{ bindings: [{ role: string; members: string[] }] }>(`b/${bucketId}/iam`)
    ).body;
    if (
      !(iamPolicy.bindings || []).find(
        (binding) =>
          binding.role === "roles/storage.objectViewer" && binding.members.includes("allusers")
      )
    ) {
      console.log("Making bucket public...");
      iamPolicy.bindings = iamPolicy.bindings || [];
      iamPolicy.bindings.push({ role: "roles/storage.objectViewer", members: ["allUsers"] });
      await storage.put(`b/${bucketId}/iam`, iamPolicy);
    }

    await ensure(projectId, "compute.googleapis.com", "storage");

    // create a backend bucket pointed to the bucket
    const backendId = `firebase-${displayBucket}-backend`;
    if (await doesNotExist(`projects/${projectId}/global/backendBuckets/${backendId}`)) {
      console.log("Creating backend", backendId, "...");
      const resp = await compute.post<any, { name: string }>(
        `projects/${projectId}/global/backendBuckets`,
        {
          name: backendId,
          description: `Cloud Storage for Firebase Backend Bucket for ${bucketId}`,
          bucketName: bucketId,
          enableCdn: true,
          labels,
        }
      );
      printResp(resp);
      await pollComputeOperation(projectId, resp.body.name);
    }

    // create a url map pointing to the backend bucket
    const urlMapId = `firebase-${displayBucket}-urlmap`;
    if (await doesNotExist(`projects/${projectId}/global/urlMaps/${urlMapId}`)) {
      console.log("Creating URL Map", urlMapId, "...");
      printResp(
        await compute.post(`projects/${projectId}/global/urlMaps`, {
          name: urlMapId,
          description: `Cloud Storage for Firebase URLMap for ${bucketId}`,
          defaultService: `global/backendBuckets/${backendId}`,
          labels,
        })
      );
    }

    // create a certificate pointing to the domain
    const certId = `firebase-${displayBucket}-cert`;
    if (await doesNotExist(`projects/${projectId}/global/sslCertificates/${certId}`)) {
      console.log("Creating SSL certificate...");
      printResp(
        await compute.post(`projects/${projectId}/global/sslCertificates`, {
          name: certId,
          managed: {
            domains: [`${displayBucket}.storagecdn.domainsfordays.net`],
          },
          type: "MANAGED",
          labels,
        })
      );
    }

    // create an https target proxy pointing to the urlmap and certificate
    const targetProxyId = `firebase-${displayBucket}-proxy`;
    if (await doesNotExist(`projects/${projectId}/global/targetHttpsProxies/${targetProxyId}`)) {
      console.log("Creating HTTPS target proxy...");
      const resp = await compute.post<any, { name: string }>(
        `projects/${projectId}/global/targetHttpsProxies`,
        {
          name: targetProxyId,
          urlMap: `global/urlMaps/${urlMapId}`,
          sslCertificates: [`global/sslCertificates/${certId}`],
          labels,
        }
      );
      printResp(resp);
      await pollComputeOperation(projectId, resp.body.name);
    }

    // reserve an external ip address
    const ipId = `firebase-${displayBucket}-ip`;
    if (await doesNotExist(`projects/${projectId}/global/addresses/${ipId}`)) {
      console.log("Creating reserved IP address...");
      printResp(
        await compute.post(`projects/${projectId}/global/addresses`, {
          name: ipId,
          description: `Cloud Storage for Firebase reserved IP for ${bucketId}`,
          ipVersion: "IPv4",
          addressType: "EXTERNAL",
        })
      );
    }

    // create a forwarding rule pointed to the http proxy and ip address
    const ruleId = `firebase-${displayBucket}-rule`;
    if (await doesNotExist(`projects/${projectId}/global/forwardingRules/${ruleId}`)) {
      console.log("Creating forwarding rule...");
      const resp = await compute.post<any, { name: string }>(
        `projects/${projectId}/global/forwardingRules`,
        {
          name: ruleId,
          description: `Cloud Storage for Firebase Forwarding Rule for ${bucketId}`,
          IPProtocol: "TCP",
          IPAddress: `global/addresses/${ipId}`,
          loadBalancingScheme: "EXTERNAL",
          target: `global/targetHttpsProxies/${targetProxyId}`,
          portRange: "443",
          labels,
        }
      );
      printResp(resp);
      await pollComputeOperation(projectId, resp.body.name);
    }

    console.log(
      "\n\nALL DONE! You now have a shiny load balancer.\n",
      `Visit: https://console.cloud.google.com/net-services/loadbalancing/loadBalancers/list?project=${projectId}`
    );
  });
