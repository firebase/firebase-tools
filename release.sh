#!/bin/bash

# Get the version number that is being released
while [[ -z $VERSION ]]
do
  read -p "What version of firebase-tools are we releasing? " VERSION
done
echo

# Ensure the changelog has been updated for the newest version
CHANGELOG_VERSION="$(head -1 CHANGELOG.md | awk -F 'v' '{print $2}')"
if [[ $VERSION != $CHANGELOG_VERSION ]]; then
  echo "Error: Most recent version in changelog (${CHANGELOG_VERSION}) does not match version you are releasing (${VERSION})."
  exit 1
fi

# Ensure the version number in the package.json is correct
NPM_VERSION=$(grep "version" package.json | head -1 | awk -F '"' '{print $4}')
if [[ $VERSION != $NPM_VERSION ]]; then
  echo "Error: npm version specified in package.json (${NPM_VERSION}) does not match version you are releasing (${VERSION})."
  exit 1
fi

# Ensure the checked out branch is master
CHECKED_OUT_BRANCH="$(git branch | grep "*" | awk -F ' ' '{print $2}')"
if [[ $CHECKED_OUT_BRANCH != "master" ]]; then
  echo "Error: Your firebase-tools repo is not on the master branch."
  exit 1
fi

# Pull any changes to the firebase-tools repo
git pull origin master
if [[ $? -ne 0 ]]; then
  echo "Error: Failed to do git pull from firebase-tools repo."
  exit 1
fi

# Create a git tag for the new version
LAST_GIT_TAG="$(git tag --list | tail -1 | awk -F 'v' '{print $2}')"
if [[ $VERSION != $LAST_GIT_TAG ]]; then
  git tag v$VERSION
  git push --tags

  echo "*** Last commit tagged as v${VERSION} ***"
  echo
else
  echo "Error: git tag v${VERSION} already exists. Make sure you are not releasing an already-released version."
  exit 1
fi

# Publish the new version to npm
npm publish
if [[ $? -ne 0 ]]; then
  echo "!!! Error publishing to npm! You must do this manually by running 'npm publish'. !!!"
  exit 1
else
  echo "*** v${VERSION} published to npm as firebase-tools ***"
  echo
fi

sed -i.bak s/\"firebase-tools\"/\"firebase-cli\"/g package.json
if [[ $? -ne 0 ]]; then
  echo "Error: Failed to replace firebase-tools with firebase-cli in the package.json."
  exit 1
fi
rm package.json.bak

# Publish the alternative version to npm
npm publish
if [[ $? -ne 0 ]]; then
  echo "!!! Error publishing to npm! You must do this manually by running 'npm publish'. !!!"
  exit 1
else
  echo "*** v${VERSION} published to npm as firebase-cli ***"
  echo
fi

git checkout -- package.json

echo "Manual steps remaining:"
echo "  1) Update the release notes for firebase-tools version ${VERSION} on GitHub"
echo "  2) Update all firebase-tools version numbers specified in firebase-website to ${VERSION}"
echo "  3) Tweet @FirebaseRelease: 'v${VERSION} of @Firebase tools CLI is available: https://www.npmjs.org/package/firebase-tools Changelog: https://github.com/firebase/firebase-tools/blob/master/CHANGELOG.md'"
echo
echo "Done! Woot!"
echo