import { Uri, Webview } from "vscode";

export function getHtmlForWebview(
  entryName: string,
  extensionUri: Uri,
  webview: Webview
) {
  const scriptUri = webview.asWebviewUri(
    Uri.joinPath(extensionUri, `dist/web-${entryName}.js`)
  );
  const styleUri = webview.asWebviewUri(
    Uri.joinPath(extensionUri, `dist/web-${entryName}.css`)
  );
  const moniconWoffUri = webview.asWebviewUri(
    Uri.joinPath(extensionUri, "resources/Monicons.woff")
  );
  const codiconsUri = webview.asWebviewUri(
    Uri.joinPath(extensionUri, "node_modules/@vscode/codicons/dist/codicon.css")
  );
  // Use a nonce to only allow a specific script to be run.
  const nonce = getNonce();

  return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="
          default-src 'none';
          font-src ${webview.cspSource};
          img-src ${webview.cspSource};
          frame-src https://*;
          style-src ${webview.cspSource} 'unsafe-inline';
          script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${codiconsUri
          .toString()
          .replace(/%40/g, "@")}" rel="stylesheet">
				<link href="${styleUri}" rel="stylesheet">
        <style>
          @font-face {
            font-family: "Monicons";
            src: url("${moniconWoffUri}") format("woff");
            font-weight: normal;
            font-style: normal;
          }
        </style>
			</head>
			<body>
        <div id="root"></div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
}

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
