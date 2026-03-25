import { Config } from "../../config";
import { Setup } from "..";
import { promptForAgentSkills, installAgentSkills } from "../../agentSkills";
import { logger } from "../../logger";
import { getErrMsg } from "../../error";

export interface AgentSkillsInfo {
  shouldInstall: boolean;
}

export async function askQuestions(setup: Setup): Promise<void> {
  try {
    logger.info(
      "If you are using an AI coding agent, Firebase Agent Skills make it an expert at Firebase.",
    );
    const shouldInstall = await promptForAgentSkills();
    setup.featureInfo = setup.featureInfo || {};
    setup.featureInfo.agentSkills = { shouldInstall };
  } catch (err: unknown) {
    logger.debug(`Could not prompt for agent skills: ${getErrMsg(err)}`);
  }
}

export async function actuate(setup: Setup, config: Config): Promise<void> {
  const info = setup.featureInfo?.agentSkills;
  if (!info || !info.shouldInstall) {
    return;
  }

  const cwd = config.projectDir;
  void installAgentSkills({ background: true, cwd });
}
