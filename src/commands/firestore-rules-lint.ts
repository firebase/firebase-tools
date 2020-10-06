import { Command } from "../command";

export default new Command("firestore:rules:lint")
  .description("Analyze `firestore.rules`")
  .action((options: any) => {
    console.log(options);
    return undefined;
  });
