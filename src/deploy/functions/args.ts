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

import * as backend from "./backend";
import * as gcfV2 from "../../gcp/cloudfunctionsv2";
import * as projectConfig from "../../functions/projectConfig";
import * as deployHelper from "./functionsDeployHelper";

// These types should probably be in a root deploy.ts, but we can only boil the ocean one bit at a time.
interface CodebasePayload {
  wantBackend: backend.Backend;
  haveBackend: backend.Backend;
}

// Source holds details on location of packaged and uploaded source code.
export interface Source {
  // Filled in the "prepare" phase.
  functionsSourceV1?: string;
  functionsSourceV2?: string;

  // Filled in the "deploy" phase.
  sourceUrl?: string;
  storage?: gcfV2.StorageSource;
}

// Payload holds the output of what we want to build + what we already have.
export interface Payload {
  functions?: Record<string, CodebasePayload>; // codebase -> payload
}

// Context holds cached values of what we've looked up in handling this request.
// For non-trivial values, use helper functions that cache automatically and/or hide implementation
// details.
export interface Context {
  projectId: string;
  filters?: deployHelper.EndpointFilter[];

  // Filled in the "prepare" phase.
  config?: projectConfig.ValidatedConfig;
  artifactRegistryEnabled?: boolean;
  firebaseConfig?: FirebaseConfig;

  // Filled in the "prepare" and "deploy" phase.
  sources?: Record<string, Source>; // codebase -> source
}

export interface FirebaseConfig {
  locationId: string;
  projectId: string;
  storageBucket: string;
  databaseURL: string;
}
