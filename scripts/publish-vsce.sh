#!/bin/bash
set -e

printusage() {
  echo "publish-vsce.sh <version> <cli-version-number>"
  echo "Should be run as part of publish.sh."
  echo ""
  echo ""
  echo "Arguments:"
  echo "  version: 'patch', 'minor', or 'major'."
  echo "  cli-version-number: the version number of the CLI code that is bundled in this release."
}

VERSION=$1

CLI_VERSION=$2
if [[ ($VERSION == "" || $CLI_VERSION == "") ]]; then
  printusage
  exit 1
elif [[ ! ($VERSION == "patch" || $VERSION == "minor" || $VERSION == "major") ]]; then
  printusage
  exit 1
fi

cd firebase-vscode

echo "Making a $VERSION version of VSCode..."
npm version $VERSION
NEW_VSCODE_VERSION=$(jq -r ".version" package.json)
NEXT_HEADER="## NEXT"
NEW_HEADER="## NEXT\n\n## $NEW_VSCODE_VERSION\n\n- Updated internal firebase-tools dependency to $CLI_VERSION"
sed -i -e "s/$NEXT_HEADER/$NEW_HEADER/g" CHANGELOG.md
echo "Made a $VERSION version of VSCode."

echo "Running npm install for VSCode..."
npm install
echo "Ran npm install for VSCode."

echo "Building firebase-vscode .VSIX file"
NODE_OPTIONS="--max-old-space-size=8192" npm run pkg
echo "Built firebase-vscode .VSIX file."

echo "Uploading VSIX file to GCS..."
VSIX="firebase-vscode-$NEW_VSCODE_VERSION.vsix"
gsutil cp $VSIX gs://firemat-preview-drop/vsix/$VSIX
gsutil cp $VSIX gs://firemat-preview-drop/vsix/firebase-vscode-latest.vsix
echo "Uploaded VSIX file to GCS."
cd ..