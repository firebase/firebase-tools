import React from "react";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { broker } from "../../globals/html-broker";

export function ExternalLink({ href, text }: { href: string; text: string }) {
  return (
    <VSCodeLink onClick={() => broker.send("openLink", { href })}>
      {text}
    </VSCodeLink>
  );
}
