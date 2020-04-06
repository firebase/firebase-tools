import { Command } from "../command";
import {FirebaseModel} from "../ml/models";

module.exports = new Command("ml:models:list")
  .description(
    "lists all the Firebase ML Models in the current project."
  )
  .option("-f --filter <filterString>", "(optional) A valid filterString.")
  .action(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (options: any): Promise<FirebaseModel[]> => {
      throw new Error('Not Implemented');
    }
  );
