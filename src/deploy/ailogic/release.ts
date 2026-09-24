import * as clc from "colorette";

import * as utils from "../../utils";
import { FirebaseError, getErrStatus } from "../../error";
import { needProjectId } from "../../projectUtils";
import * as ailogic from "../../gcp/ailogic";
import { TemplateDeployPlan } from "../../ailogic/templates";
import { DeployOptions } from "..";

export interface AiLogicDeployContext {
  projectId?: string;
  ailogic?: {
    templates: Map<string, string>;
    plan: TemplateDeployPlan;
    etags: Map<string, string | undefined>;
  };
}

/**
 * Applies the plan computed in prepare: creates, masked updates, and prunes.
 * Applied sequentially so the progress log stays ordered and a mid-deploy
 * failure leaves a comprehensible prefix of applied changes.
 */
export async function release(
  context: AiLogicDeployContext,
  options: DeployOptions,
): Promise<void> {
  if (!context.ailogic) {
    return;
  }
  const projectId = needProjectId(options);
  const { templates, plan, etags } = context.ailogic;

  for (const templateId of plan.creates) {
    utils.logLabeledBullet("ailogic", `creating template ${clc.bold(templateId)}...`);
    await ailogic.updateTemplate(projectId, templateId, {
      // The id came from the map's own keys, so the lookup always succeeds.
      templateString: templates.get(templateId) ?? "",
      displayName: templateId,
    });
  }
  for (const templateId of plan.updates) {
    utils.logLabeledBullet("ailogic", `updating template ${clc.bold(templateId)}...`);
    const etag = etags.get(templateId);
    try {
      // Mask the write to templateString: an unmasked PATCH replaces the whole
      // resource, which would clear a displayName set outside this deploy. The
      // body etag stays enforced as a precondition under the mask.
      await ailogic.updateTemplate(
        projectId,
        templateId,
        {
          templateString: templates.get(templateId) ?? "",
          ...(etag ? { etag } : {}),
        },
        ["templateString"],
      );
    } catch (err: unknown) {
      if (getErrStatus(err) === 409) {
        throw new FirebaseError(
          `Template ${clc.bold(templateId)} was modified while deploying. Re-run the deploy to apply your local files against the latest remote state.`,
        );
      }
      throw err;
    }
  }
  for (const templateId of plan.deletes) {
    utils.logLabeledBullet("ailogic", `deleting template ${clc.bold(templateId)}...`);
    try {
      await ailogic.deleteTemplate(projectId, templateId, etags.get(templateId));
    } catch (err: unknown) {
      // The template can be deleted out from under us between the plan and this
      // delete; the desired end state is reached, so don't fail the deploy.
      if (getErrStatus(err) === 404) {
        utils.logLabeledBullet("ailogic", `template ${clc.bold(templateId)} was already deleted.`);
        continue;
      }
      if (getErrStatus(err) === 409) {
        throw new FirebaseError(
          `Template ${clc.bold(templateId)} was modified while deploying, so it was not deleted. Re-run the deploy to plan against the latest remote state.`,
        );
      }
      throw err;
    }
  }

  if (plan.creates.length === 0 && plan.updates.length === 0 && plan.deletes.length === 0) {
    utils.logLabeledSuccess("ailogic", "all templates are already up to date.");
  } else {
    utils.logLabeledSuccess(
      "ailogic",
      `templates deployed: ${plan.creates.length} created, ${plan.updates.length} updated, ${plan.deletes.length} deleted.`,
    );
  }
}
