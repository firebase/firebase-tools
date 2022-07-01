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

import { checkBillingEnabled } from "../../gcp/cloudbilling";
import { enableBilling } from "../../extensions/checkProjectBilling";
import { FirebaseError } from "../../error";

export async function checkBilling(projectId: string, nonInteractive: boolean) {
  const enabled = await checkBillingEnabled(projectId);
  if (!enabled && nonInteractive) {
    throw new FirebaseError(
      `Extensions require the Blaze plan, but project ${projectId} is not on the Blaze plan. ` +
        `Please visit https://console.cloud.google.com/billing/linkedaccount?project=${projectId} to upgrade your project.`
    );
  } else if (!enabled) {
    await enableBilling(projectId);
  }
}
