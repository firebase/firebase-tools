#!/bin/bash
set -e

printusage() {
  echo "publish-vsce.sh <version>"
  echo "Should be run as part of publish.sh."
  echo ""
  echo ""
  echo "Arguments:"
  echo "  version: 'patch', 'minor', or 'major'."
}

VERSION=$1
if [[ $VERSION == "" ]]; then
  printusage
  exit 1
elif [[ ! ($VERSION == "patch" || $VERSION == "minor" || $VERSION == "major") ]]; then
  printusage
  exit 1
fi

cd firebase-vscode
echo "Running npm install for VSCode..."
npm install
echo "Ran npm install for VSCode."
echo "Making a $VERSION version of VSCode..."
npm version $VERSION
NEW_VSCODE_VERSION=$(jq -r ".version" package.json)
NEXT_HEADER="## NEXT"
NEW_HEADER="## NEXT \n\n## $NEW_VSCODE_VERSION"
sed -i '' -e "s/$NEXT_HEADER/$NEW_HEADER/g" CHANGELOG.md
echo "Made a $VERSION version of VSCode."
echo "Ran tests."
echo "Building firebase-vscode .VSIX file"
npm run pkg
echo "Built firebase-vscode .VSIX file."
VSIX="firebase-vscode-$NEW_VSCODE_VERSION.vsix"
echo "Uploading VSIX file to GCS..."
gsutil cp $VSIX gs://firemat-preview-drop/vsix/$VSIX
gsutil cp $VSIX gs://firemat-preview-drop/vsix/firebase-vscode-latest.vsix
echo "Uploaded VSIX file to GCS."
cd ..