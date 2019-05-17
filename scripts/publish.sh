#!/bin/bash
set -e

printusage() {
  echo "publish.sh <version>"
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

WDIR=$(pwd)

echo "Checking for commands..."
trap "echo 'Missing hub.'; exit 1" ERR
which hub &> /dev/null
trap - ERR

trap "echo 'Missing nvm.'; exit 1" ERR
file "${HOME}/.nvm/nvm.sh" &> /dev/null
source "${HOME}/.nvm/nvm.sh"
trap - ERR

trap "echo 'Missing jq.'; exit 1" ERR
which jq &> /dev/null
trap - ERR
echo "Checked for commands."

echo "Checking for Twitter credentials..."
trap "echo 'Missing Twitter credentials.'; exit 1" ERR
test -f ${WDIR}/scripts/twitter.json
trap - ERR
echo "Checked for Twitter credentials..."

echo "Using node 8..."
nvm use 8
echo "Using node 8."

echo "Checking for logged-in user..."
trap "echo 'Please login to npm using \`npm login --registry https://wombat-dressing-room.appspot.com\`'; exit 1" ERR
npm whoami --registry https://wombat-dressing-room.appspot.com
trap - ERR
echo "Checked for logged-in user."

echo "Moving to temporary directory.."
TEMPDIR=$(mktemp -d)
echo "[DEBUG] ${TEMPDIR}"
cd "${TEMPDIR}"
echo "Moved to temporary directory."

echo "Cloning repository..."
git clone git@github.com:firebase/firebase-tools.git
cd firebase-tools
echo "Cloned repository."

echo "Making sure there is a changelog..."
if [ ! -s changelog.txt ]; then
  echo "changelog.txt is empty. aborting."
  exit 1
fi
echo "Made sure there is a changelog."

echo "Running npm install..."
npm install
echo "Ran npm install."

echo "Running tests..."
npm test
echo "Ran tests."

echo "Making a $VERSION version..."
npm version $VERSION
NEW_VERSION=$(jq -r ".version" package.json)
echo "Made a $VERSION version."

echo "Making the release notes..."
RELEASE_NOTES_FILE=$(mktemp)
echo "[DEBUG] ${RELEASE_NOTES_FILE}"
echo "v${NEW_VERSION}" >> "${RELEASE_NOTES_FILE}"
echo "" >> "${RELEASE_NOTES_FILE}"
cat changelog.txt >> "${RELEASE_NOTES_FILE}"
echo "Made the release notes."

echo "Publishing to npm..."
npm publish
echo "Published to npm."

echo "Cleaning up release notes..."
rm changelog.txt
touch changelog.txt
git commit -m "[firebase-release] Removed change log and reset repo after ${NEW_VERSION} release" changelog.txt
echo "Cleaned up release notes."

echo "Pushing to GitHub..."
git push origin master --tags
echo "Pushed to GitHub."

echo "Publishing release notes..."
hub release create --file "${RELEASE_NOTES_FILE}" "v${NEW_VERSION}"
echo "Published release notes."

echo "Making the tweet..."
npm install --no-save twitter@1.7.1
cp ${WDIR}/scripts/twitter.json ${TEMPDIR}/firebase-tools/scripts/
node ./scripts/tweet.js ${NEW_VERSION}
echo "Made the tweet."
