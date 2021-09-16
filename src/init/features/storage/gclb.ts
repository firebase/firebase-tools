import { Client, ClientResponse } from "../../../apiv2";
import { ensure } from "../../../ensureApiEnabled";
import responseToError from "../../../responseToError";

const compute = new Client({
  urlPrefix: "https://compute.googleapis.com/compute",
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

export async function initGclb(projectId: string, bucketId: string) {
  // set bucket to public access
  // reserve an IP
  // create gclb backend buckets
  // https://compute.googleapis.com/compute/v1/projects/{project}/global/backendBuckets
  await ensure(projectId, "compute.googleapis.com", "storage");

  const backendId = `firebase-${bucketId}-backend`;

  if (await doesNotExist(`projects/${projectId}/global/backendBuckets/${backendId}`)) {
    console.log("Creating backend", backendId, "...");
    printResp(
      await compute.post(`projects/${projectId}/global/backendBuckets`, {
        name: backendId,
        description: `Cloud Storage for Firebase Backend Bucket for ${bucketId}`,
        bucketName: bucketId,
        enableCdn: true,
      })
    );
  }

  const urlMapId = `firebase-${bucketId}-urlmap`;
  if (await doesNotExist(`projects/${projectId}/global/urlMaps/${urlMapId}`)) {
    console.log("Creating URL Map", urlMapId, "...");
    printResp(
      await compute.post(`projects/${projectId}/global/urlMaps`, {
        name: urlMapId,
        description: `Cloud Storage for Firebase URLMap for ${bucketId}`,
        defaultService: `global/backendBuckets/${backendId}`,
      })
    );
  }

  const targetProxyId = `firebase-${bucketId}-proxy`;
  if (await doesNotExist(`projects/${projectId}/global/targetHttpsProxies/${targetProxyId}`)) {
    console.log("Creating HTTPS target proxy...");
    printResp(
      await compute.post(`projects/${projectId}/global/targetHttpsProxies`, {
        name: targetProxyId,
        urlMap: `global/urlMaps/${urlMapId}`,
      })
    );
  }

  const ruleId = `firebase-${bucketId}-rule`;
  if (await doesNotExist(`projects/${projectId}/global/forwardingRules/${ruleId}`)) {
    console.log("Creating forwarding rule...");
    printResp(
      await compute.post(`projects/${projectId}/global/forwardingRules`, {
        name: ruleId,
        description: `Cloud Storage for Firebase Forwarding Rule for ${bucketId}`,
        IPProtocol: "TCP",
        loadBalancingScheme: "EXTERNAL",
      })
    );
  }
}
