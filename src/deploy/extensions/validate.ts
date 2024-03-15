import { checkBillingEnabled } from "../../gcp/cloudbilling";
import { enableBilling } from "../../extensions/checkProjectBilling";
import { FirebaseError } from "../../error";

export async function checkBilling(projectId: string, nonInteractive: boolean) {
  const enabled = await checkBillingEnabled(projectId);
  if (!enabled && nonInteractive) {
    throw new FirebaseError(
      `Extensions require the Blaze plan, but project ${projectId} is not on the Blaze plan. ` +
        `Please visit https://console.cloud.google.com/billing/linkedaccount?project=${projectId} to upgrade your project.`,
    );
  } else if (!enabled) {
    await enableBilling(projectId);
  }
}
