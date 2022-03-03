// Note: unlike Google APIs, the documentation for the GCR API is
// actually the Docker REST API. This can be found at
// https://docs.docker.com/registry/spec/api/
// This API is _very_ complex in its entirety and is very subtle (e.g. tags and digests
// are both strings and can both be put in the same route to get completely different
// response document types).
// This file will only implement a minimal subset as needed.
import { FirebaseError } from "../error";
import * as api from "../apiv2";

// A mapping from geographical region to subdomain, useful for Container Registry
export const GCR_SUBDOMAIN_MAPPING: Record<string, string> = {
  "us-west1": "us",
  "us-west2": "us",
  "us-west3": "us",
  "us-west4": "us",
  "us-central1": "us",
  "us-central2": "us",
  "us-east1": "us",
  "us-east4": "us",
  "northamerica-northeast1": "us",
  "southamerica-east1": "us",
  "europe-west1": "eu",
  "europe-west2": "eu",
  "europe-west3": "eu",
  "europe-west4": "eu",
  "europe-west5": "eu",
  "europe-west6": "eu",
  "europe-central2": "eu",
  "europe-north1": "eu",
  "asia-east1": "asia",
  "asia-east2": "asia",
  "asia-northeast1": "asia",
  "asia-northeast2": "asia",
  "asia-northeast3": "asia",
  "asia-south1": "asia",
  "asia-southeast2": "asia",
  "australia-southeast1": "asia",
};

// A Digest is a string in the format <algorithm>:<hex>. For example:
// sha256:146d8c9dff0344fb01417ef28673ed196e38215f3c94837ae733d3b064ba439e
export type Digest = string;
export type Tag = string;

export interface Tags {
  name: string;
  tags: string[];

  // These fields are not documented in the Docker API but are
  // present in the GCR API.
  manifest: Record<Digest, ImageInfo>;
  child: string[];
}

export interface ImageInfo {
  // times are string milliseconds
  timeCreatedMs: string;
  timeUploadedMs: string;
  tag: string[];
  mediaType: string;
  imageSizeBytes: string;
  layerId: string;
}

interface ErrorsResponse {
  errors?: {
    code: string;
    message: string;
    details: unknown;
  }[];
}

function isErrors(response: unknown): response is ErrorsResponse {
  // Artifact registry will return 202 w/ no body on some success cases.
  return !!response && Object.prototype.hasOwnProperty.call(response, "errors");
}

const API_VERSION = "v2";

export class Client {
  readonly client: api.Client;

  constructor(origin: string) {
    this.client = new api.Client({
      apiVersion: API_VERSION,
      auth: true,
      urlPrefix: origin,
    });
  }

  async listTags(path: string): Promise<Tags> {
    const response = await this.client.get<Tags | ErrorsResponse>(`${path}/tags/list`);
    if (isErrors(response.body)) {
      throw new FirebaseError(`Failed to list GCR tags at ${path}`, {
        children: response.body.errors,
      });
    }
    return response.body;
  }

  async deleteTag(path: string, tag: Tag): Promise<void> {
    const response = await this.client.delete<ErrorsResponse>(`${path}/manifests/${tag}`);
    if (!response.body) {
      return;
    }
    if (response.body.errors?.length !== 0) {
      throw new FirebaseError(`Failed to delete tag ${tag} at path ${path}`, {
        children: response.body.errors,
      });
    }
  }

  async deleteImage(path: string, digest: Digest): Promise<void> {
    const response = await this.client.delete<ErrorsResponse>(`${path}/manifests/${digest}`);
    if (!response.body) {
      return;
    }
    if (response.body.errors?.length !== 0) {
      throw new FirebaseError(`Failed to delete image ${digest} at path ${path}`, {
        children: response.body.errors,
      });
    }
  }
}
