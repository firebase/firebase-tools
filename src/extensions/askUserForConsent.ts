import { marked } from "marked";
import * as TerminalRenderer from "marked-terminal";

import { FirebaseError } from "../error";
import { logPrefix } from "../extensions/extensionsHelper";
import { promptOnce } from "../prompt";
import * as utils from "../utils";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Displays publisher terms of service and asks user to consent to them.
 * Errors if they do not consent.
 */
export async function promptForPublisherTOS(): Promise<void> {
  const termsOfServiceMsg =
    "By registering as a publisher, you confirm that you have read the Firebase Extensions Publisher Terms and Conditions (linked below) and you, on behalf of yourself and the organization you represent, agree to comply with it.  Here is a brief summary of the highlights of our terms and conditions:\n" +
    "  - You ensure extensions you publish comply with all laws and regulations; do not include any viruses, spyware, Trojan horses, or other malicious code; and do not violate any person’s rights, including intellectual property, privacy, and security rights.\n" +
    "  - You will not engage in any activity that interferes with or accesses in an unauthorized manner the properties or services of Google, Google’s affiliates, or any third party.\n" +
    "  - If you become aware or should be aware of a critical security issue in your extension, you will provide either a resolution or a written resolution plan within 48 hours.\n" +
    "  - If Google requests a critical security matter to be patched for your extension, you will respond to Google within 48 hours with either a resolution or a written resolution plan.\n" +
    "  - Google may remove your extension or terminate the agreement, if you violate any terms.";
  utils.logLabeledBullet(logPrefix, marked(termsOfServiceMsg));
  const consented: boolean = await promptOnce({
    name: "consent",
    type: "confirm",
    message: marked(
      "Do you accept the [Firebase Extensions Publisher Terms and Conditions](https://firebase.google.com/docs/extensions/alpha/terms-of-service) and acknowledge that your information will be used in accordance with [Google's Privacy Policy](https://policies.google.com/privacy?hl=en)?"
    ),
    default: false,
  });
  if (!consented) {
    throw new FirebaseError("You must agree to the terms of service to register a publisher ID.", {
      exit: 1,
    });
  }
}
