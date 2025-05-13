import { Command } from "../command";
import { requirePermissions } from "../requirePermissions";
import { requireAuth } from "../requireAuth";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import * as sendMessage from "../messaging/sendmessage";
import * as utils from "../utils";


export const command = new Command("messaging:sendmessage:token")
  .description("Sends a message to a token using Fireabse Messaging")
  .option("-f , --fcm-token <fcmToken>", "send message to this FCM token")
  .option("-t , --title <messageTitle>", "title of the message")
  .option("-b , --body <messageBody>", "body of the message")
  .option("-i , --image-url <imageUrl>", "url of the image")
  .before(requireAuth)
  .before(requirePermissions, ["cloudmessaging.messages.create"])
  .action(async (options: Options) => {
    const projectID = needProjectId(options);
    utils.assertIsString(options.fcmToken);
    utils.assertIsStringOrUndefined(options.title);
    utils.assertIsStringOrUndefined(options.body);
    utils.assertIsStringOrUndefined(options.imageUrl);
    return await sendMessage.sendMessageToToken(
        projectID, options.fcmToken, options.title, options.body, options.imageUrl);
  });
