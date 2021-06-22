// Note: unlike Google APIs, the documentation for the GCR API is
// actually the Docker REST API. This can be found at
// https://docs.docker.com/registry/spec/api/
// This API is _very_ complex in its entirety and is very subtle (e.g. tags and digests
// are both strings and can both be put in the same route to get completely different
// response document types).
// This file will only implement a minimal subset as needed.
import { FirebaseError } from "../error";
import * as api from "../apiv2";

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
  return Object.prototype.hasOwnProperty.call(response, "errors");
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
    if (response.body.errors?.length != 0) {
      throw new FirebaseError(`Failed to delete tag ${tag} at path ${path}`, {
        children: response.body.errors,
      });
    }
  }

  async deleteImage(path: string, digest: Digest): Promise<void> {
    const response = await this.client.delete<ErrorsResponse>(`${path}/manifests/${digest}`);
    if (response.body.errors?.length != 0) {
      throw new FirebaseError(`Failed to delete image ${digest} at path ${path}`, {
        children: response.body.errors,
      });
    }
  }
}
