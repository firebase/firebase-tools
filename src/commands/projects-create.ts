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

import { Command } from "../command";
import { FirebaseError } from "../error";
import {
  createFirebaseProjectAndLog,
  FirebaseProjectMetadata,
  ProjectParentResourceType,
  PROJECTS_CREATE_QUESTIONS,
} from "../management/projects";
import { prompt } from "../prompt";
import { requireAuth } from "../requireAuth";

export const command = new Command("projects:create [projectId]")
  .description(
    "creates a new Google Cloud Platform project, then adds Firebase resources to the project"
  )
  .option("-n, --display-name <displayName>", "(optional) display name for the project")
  .option(
    "-o, --organization <organizationId>",
    "(optional) ID of the parent Google Cloud Platform organization under which to create this project"
  )
  .option(
    "-f, --folder <folderId>",
    "(optional) ID of the parent Google Cloud Platform folder in which to create this project"
  )
  .before(requireAuth)
  .action(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (projectId: string | undefined, options: any): Promise<FirebaseProjectMetadata> => {
      options.projectId = projectId; // add projectId into options to pass into prompt function

      if (options.organization && options.folder) {
        throw new FirebaseError(
          "Invalid argument, please provide only one type of project parent (organization or folder)"
        );
      }
      if (!options.nonInteractive) {
        await prompt(options, PROJECTS_CREATE_QUESTIONS);
      }
      if (!options.projectId) {
        throw new FirebaseError("Project ID cannot be empty");
      }

      let parentResource;
      if (options.organization) {
        parentResource = { type: ProjectParentResourceType.ORGANIZATION, id: options.organization };
      } else if (options.folder) {
        parentResource = { type: ProjectParentResourceType.FOLDER, id: options.folder };
      }

      return createFirebaseProjectAndLog(options.projectId, {
        displayName: options.displayName,
        parentResource,
      });
    }
  );
