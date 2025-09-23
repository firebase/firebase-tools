import * as iam from "../gcp/iam";
import { getIamPolicy, setIamPolicy } from "../gcp/resourceManager";
import * as cloudSqlAdmin from "../gcp/cloudsql/cloudsqladmin";
import { FirebaseError } from "../error";

export async function grantRolesToCloudSqlServiceAccount(
  projectId: string,
  instanceId: string,
  roles: string[],
): Promise<void> {
  const instance = await cloudSqlAdmin.getInstance(projectId, instanceId);
  const saEmail = instance.serviceAccountEmailAddress;
  const policy = await getIamPolicy(projectId);
  const requiredBindings = roles.map((r) => {
    const binding: iam.Binding = {
      role: r,
      members: [`serviceAccount:${saEmail}`],
    };
    return binding;
  });
  const updated = iam.mergeBindings(policy, requiredBindings);
  if (updated) {
    try {
      await setIamPolicy(projectId, policy, "bindings");
    } catch (err: any) {
      iam.printManualIamConfig(requiredBindings, projectId, "dataconnect");
      throw new FirebaseError("Unable to make required IAM policy changes.");
    }
  }
}
