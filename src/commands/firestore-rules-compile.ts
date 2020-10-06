import { Command } from "../command";
import { RulesDeploy, RulesetServiceType } from "../rulesDeploy";
import { requireAuth } from "../requireAuth";

export default new Command("firestore:rules:compile")
  .description("Check `firestore.rules` for compilation errors.")
  .before(requireAuth)
  .action(async (options: any) => {
    const rulesFile = options.config.get("firestore.rules");
    const rulesDeploy = new RulesDeploy(options, RulesetServiceType.CLOUD_FIRESTORE);
    rulesDeploy.addFile(rulesFile);
    return rulesDeploy.compile();
  });
