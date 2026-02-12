#!/bin/bash
set -e

printusage() {
  echo "publish.sh <version> [branch]"
  echo "REPOSITORY_ORG and REPOSITORY_NAME should be set in the environment."
  echo "e.g. REPOSITORY_ORG=user, REPOSITORY_NAME=repo"
  echo ""
  echo "Arguments:"
  echo "  version: 'patch', 'minor', 'major', 'artifactsOnly', or 'preview'"
  echo "  branch: required if version is 'preview'"
}

VERSION=$1
BRANCH=$2
if [[ $VERSION == "" ]]; then
  printusage
  exit 1
elif [[ $VERSION == "artifactsOnly" ]]; then
  echo "Skipping npm package publish since VERSION is artifactsOnly."
  exit 0
elif [[ $VERSION == "preview" ]]; then
  if [[ $BRANCH == "" ]]; then
    printusage
    exit 1
  fi
elif [[ ! ($VERSION == "patch" || $VERSION == "minor" || $VERSION == "major") ]]; then
  printusage
  exit 1
fi

if [[ $REPOSITORY_ORG == "" ]]; then
  printusage
  exit 1
fi
if [[ $REPOSITORY_NAME == "" ]]; then
  printusage
  exit 1
fi

WDIR=$(pwd)

echo "Checking for commands..."
trap "echo 'Missing hub.'; exit 1" ERR
which hub &> /dev/null
trap - ERR

trap "echo 'Missing node.'; exit 1" ERR
which node &> /dev/null
trap - ERR

trap "echo 'Missing jq.'; exit 1" ERR
which jq &> /dev/null
trap - ERR

echo "Checking for logged-in npm user..."
trap "echo 'Please login to npm using \`npm login --registry https://wombat-dressing-room.appspot.com\`'; exit 1" ERR
npm whoami --registry https://wombat-dressing-room.appspot.com
trap - ERR
echo "Checked for logged-in npm user."

echo "Moving to temporary directory.."
TEMPDIR=$(mktemp -d)
echo "[DEBUG] ${TEMPDIR}"
cd "${TEMPDIR}"
echo "Moved to temporary directory."

echo "Cloning repository..."
git clone "git@github.com:${REPOSITORY_ORG}/${REPOSITORY_NAME}.git"
cd "${REPOSITORY_NAME}"
if [[ $VERSION == "preview" ]]; then
  echo "Checking out branch $BRANCH..."
  git checkout "$BRANCH"
  echo "Checked out branch $BRANCH."
fi
echo "Cloned repository."

echo "Making sure there is a changelog..."
if [ ! -s CHANGELOG.md ]; then
  echo "CHANGELOG.md is empty. aborting."
  exit 1
fi
echo "Made sure there is a changelog."

echo "Running npm install..."
npm install
echo "Ran npm install."

echo "Running tests..."
npm test
echo "Ran tests."

if [[ $VERSION == "preview" ]]; then
  echo "Making a preview version..."
  sanitized_branch=$(echo "$BRANCH" | sed 's/[^a-zA-Z0-9]/-/g')
  npm version prerelease --preid=${sanitized_branch}
  NEW_VERSION=$(jq -r ".version" package.json)
  echo "Made a preview version."
else
  echo "Making a $VERSION version..."
  git diff
  npm -v
  npm version $VERSION
  NEW_VERSION=$(jq -r ".version" package.json)
  echo "Made a $VERSION version."
fi

if [[ -d "/workspace" ]]; then
  echo "Writing version number to /workspace/version_number.txt"
  echo "$NEW_VERSION" > /workspace/version_number.txt
fi

echo "Making the release notes..."
RELEASE_NOTES_FILE=$(mktemp)
echo "[DEBUG] ${RELEASE_NOTES_FILE}"
echo "v${NEW_VERSION}" >> "${RELEASE_NOTES_FILE}"
echo "" >> "${RELEASE_NOTES_FILE}"
cat CHANGELOG.md >> "${RELEASE_NOTES_FILE}"
echo "Made the release notes."



if [[ $VERSION != "preview" ]]; then
  echo "Publishing to npm..."
  npx clean-publish@5.0.0 --before-script ./scripts/clean-shrinkwrap.sh
  echo "Published to npm."

  echo "Updating package-lock.json for Docker image..."
  npm --prefix ./scripts/publish/firebase-docker-image install
  echo "Updated package-lock.json for Docker image."


  echo "Updating server.json for MCP registry..."
  . ./scripts/update-server-json-version.sh $NEW_VERSION
  echo "Updated server.json for MCP registry."

  echo "Cleaning up release notes..."
  rm CHANGELOG.md
  touch CHANGELOG.md
  git commit -m "[firebase-release] Removed change log and reset repo after ${NEW_VERSION} release" CHANGELOG.md scripts/publish/firebase-docker-image/package-lock.json
  echo "Cleaned up release notes."

  echo "Pushing to GitHub..."
  git push origin main --tags
  echo "Pushed to GitHub."

  echo "Publishing draft release notes..."
  hub release create --draft --file "${RELEASE_NOTES_FILE}" "v${NEW_VERSION}"
  echo "Published draft release notes."
else
  echo "Publishing preview version to npm..."
  npx clean-publish@5.0.0 --before-script ./scripts/clean-shrinkwrap.sh -- --tag preview
  echo "Published preview version to npm."
fi
