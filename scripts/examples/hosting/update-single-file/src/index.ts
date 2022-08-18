#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import debugPkg from "debug";
import minimist from "minimist";
import { GoogleAuth } from "google-auth-library";

const debug = debugPkg("update-single-file");

const HOSTING_URL = "https://firebasehosting.googleapis.com/v1beta1";

async function main(): Promise<void> {
  const argv = minimist<{ project?: string; site?: string }>(process.argv.slice(2));
  const PROJECT_ID = argv.project;
  if (!PROJECT_ID) {
    throw new Error(`--project must be provided.`);
  }
  const SITE_ID = argv.site || PROJECT_ID;
  const files = Array.from(argv._);
  console.log(`Deploying files:`);
  for (const f of files) {
    console.log(`- ${f}`);
  }

  const filesByHash: Record<string, string> = {};
  for (const file of files) {
    const hasher = crypto.createHash("sha256");
    const gzipper = zlib.createGzip({ level: 9 });
    const gzipStream = fs.createReadStream(path.resolve(process.cwd(), file)).pipe(gzipper);
    const p = new Promise<void>((resolve, reject) => {
      hasher.once("readable", () => {
        debug(`Hashed file ${file}`);
        const data = hasher.read() as Buffer | string | undefined;
        if (data && typeof data === "string") {
          filesByHash[data] = file;
        } else if (data && Buffer.isBuffer(data)) {
          filesByHash[data.toString("hex")] = file;
        }
        resolve();
      });
      gzipStream.once("error", reject);
    });
    gzipStream.pipe(hasher);
    await p;
  }

  const auth = new GoogleAuth({
    scopes: "https://www.googleapis.com/auth/cloud-platform",
    projectId: PROJECT_ID,
  });
  const client = await auth.getClient();

  const res = await client.request<{ release: { name: string; version: { name: string } } }>({
    url: `${HOSTING_URL}/projects/${PROJECT_ID}/sites/${SITE_ID}/channels/live`,
  });
  debug("%d %j", res.status, res.data);

  const release = res.data.release.name;
  const currentVersion = res.data.release.version.name;

  debug(`Release name: ${release}`);
  debug(`Current version name: ${currentVersion}`);

  const exclude: string[] = [];
  for (let f of Object.values(filesByHash)) {
    f = f.startsWith("/") ? f : `/${f}`;
    exclude.push(`^${f.replace("/", "\\/")}$`);
  }
  debug("Excludes:", exclude);
  const cloneRes = await client.request<{ name: string }>({
    method: "POST",
    url: `${HOSTING_URL}/projects/${PROJECT_ID}/sites/${SITE_ID}/versions:clone`,
    body: JSON.stringify({
      sourceVersion: currentVersion,
      finalize: false,
      // exclude: { regexes: exclude },
    }),
  });

  debug("%d %j", cloneRes.status, cloneRes.data);
  const operationName = cloneRes.data.name;
  debug(`Operation name: ${operationName}`);

  let done = false;
  let newVersion = "";
  while (!done) {
    const opRes = await client.request<{ done: boolean; response: { name: string } }>({
      url: `${HOSTING_URL}/${operationName}`,
    });
    debug("%d %j", opRes.status, opRes.data);
    done = !!opRes.data.done;
    newVersion = opRes.data.response?.name;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  debug(`New version: ${newVersion}`);

  const data: Record<string, string> = {};
  for (let [h, f] of Object.entries(filesByHash)) {
    if (!f.startsWith("/")) {
      f = `/${f}`;
    }
    data[f] = h;
  }
  debug("Posting populate files: %o", { files: data });
  const populateRes = await client.request<{ uploadUrl: string; uploadRequiredHashes?: string[] }>({
    method: "POST",
    url: `${HOSTING_URL}/projects/${PROJECT_ID}/${newVersion}:populateFiles`,
    body: JSON.stringify({ files: data }),
  });
  debug("%d %j", populateRes.status, populateRes.data);

  const uploadURL = populateRes.data.uploadUrl;
  const uploadRequiredHashes = populateRes.data.uploadRequiredHashes || [];
  if (Array.isArray(uploadRequiredHashes) && uploadRequiredHashes.length) {
    for (const h of uploadRequiredHashes) {
      const uploadRes = await client.request({
        method: "POST",
        url: `${uploadURL}/${h}`,
        data: fs.createReadStream(filesByHash[h]).pipe(zlib.createGzip({ level: 9 })),
      });
      debug("%d %j", uploadRes.status, uploadRes.data);
      if (uploadRes.status !== 200) {
        throw new Error(`Failed to upload file ${filesByHash[h]} (${h})`);
      }
    }
  }

  const finalizeRes = await client.request<unknown>({
    method: "PATCH",
    url: `${HOSTING_URL}/projects/${PROJECT_ID}/${newVersion}`,
    params: { updateMask: "status" },
    body: JSON.stringify({
      status: "FINALIZED",
    }),
  });
  debug("%d %j", finalizeRes.status, finalizeRes.data);

  const releaseRes = await client.request<unknown>({
    method: "POST",
    url: `${HOSTING_URL}/projects/${PROJECT_ID}/sites/${SITE_ID}/releases`,
    params: { versionName: newVersion },
    body: JSON.stringify({
      message: "Deployed from single file uploader.",
    }),
  });
  debug("%d %j", releaseRes.status, releaseRes.data);

  const siteRes = await client.request<{ defaultUrl: string }>({
    url: `${HOSTING_URL}/projects/${PROJECT_ID}/sites/${SITE_ID}`,
  });
  debug("%d %j", siteRes.status, siteRes.data);

  console.log(`Successfully deployed! Site URL: ${siteRes.data.defaultUrl}`);
}

void main();
