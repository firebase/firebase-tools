#!/bin/bash
set -e

printusage() {
  echo "publish.sh <version> [branch] [--use-oss-gate]"
  echo "REPOSITORY_ORG and REPOSITORY_NAME should be set in the environment."
  echo "e.g. REPOSITORY_ORG=user, REPOSITORY_NAME=repo"
  echo ""
  echo "Arguments:"
  echo "  version: 'patch', 'minor', 'major', 'artifactsOnly', or 'preview'"
  echo "  branch: required if version is 'preview'"
  echo ""
  echo "Options:"
  echo "  --use-oss-gate: Publish npm package through OSS Exit Gate"
}

USE_OSS_GATE=false
POSITIONAL_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --use-oss-gate)
      USE_OSS_GATE=true
      shift
      ;;
    -*)
      echo "Unknown option: $1"
      printusage
      exit 1
      ;;
    *)
      POSITIONAL_ARGS+=("$1")
      shift
      ;;
  esac
done

VERSION=${POSITIONAL_ARGS[0]:-}
BRANCH=${POSITIONAL_ARGS[1]:-}
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
OSS_GATE_AR_REGISTRY="https://us-npm.pkg.dev/oss-exit-gate-prod/firebase-tools--npm/"

publish_to_oss_gate() {
  local tag="$1"
  local package_name
  package_name=$(jq -r ".name" package.json)

  local ar_npmrc
  ar_npmrc=$(mktemp)
  trap "rm -f '${ar_npmrc}'" RETURN EXIT

  cat > "${ar_npmrc}" <<EOF
registry=${OSS_GATE_AR_REGISTRY}
//us-npm.pkg.dev/oss-exit-gate-prod/firebase-tools--npm/:always-auth=true
EOF

  echo "Authenticating with OSS Exit Gate Artifact Registry..."
  npx --yes --registry=https://registry.npmjs.org/ google-artifactregistry-auth \
    --repo-config="${ar_npmrc}" \
    --credential-config="${ar_npmrc}"

  local publish_args=(
    --fields publishConfig
    --before-script ./scripts/clean-shrinkwrap.sh
    --
    --registry="${OSS_GATE_AR_REGISTRY}"
    --userconfig="${ar_npmrc}"
  )
  if [[ -n "$tag" ]]; then
    publish_args+=(--tag "$tag")
  fi

  echo "Publishing ${package_name}@${NEW_VERSION} to OSS Exit Gate Artifact Registry..."
  npx --yes clean-publish@5.0.0 "${publish_args[@]}"

  local manifest_path="${WDIR}/manifest.json"
  if [[ -d "/workspace" ]]; then
    manifest_path="/workspace/manifest.json"
  fi
  local npm_tags='["latest"]'
  if [[ -n "$tag" ]]; then
    npm_tags=$(jq -cn --arg t "$tag" '[$t]')
  fi

  jq -n \
    --arg name "$package_name" \
    --arg version "$NEW_VERSION" \
    --argjson tags "$npm_tags" \
    '{
      publish_all: false,
      publishing_groups: [{ packages: [{ name: $name, version: $version }] }],
      registry_config: { npm: { tags: $tags } }
    }' > "${manifest_path}"
  echo "Wrote OSS Exit Gate manifest to ${manifest_path}"
}

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

if [[ $USE_OSS_GATE != true ]]; then
  echo "Checking for logged-in npm user..."
  trap "echo 'Please login to npm using \`npm login --registry https://wombat-dressing-room.appspot.com\`'; exit 1" ERR
  npm whoami --registry https://wombat-dressing-room.appspot.com
  trap - ERR
  echo "Checked for logged-in npm user."
fi

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

if [[ $VERSION != "preview" ]]; then
  echo "Making sure there is a changelog..."
  if [ ! -s CHANGELOG.md ]; then
    echo "CHANGELOG.md is empty. aborting."
    exit 1
  fi
  echo "Made sure there is a changelog."
fi

echo "Running npm install..."
npm install
echo "Ran npm install."

echo "Running tests..."
npm test
echo "Ran tests."

if [[ $VERSION == "preview" ]]; then
  echo "Making a preview version..."
  sanitized_branch=$(echo "$BRANCH" | sed 's/[^a-zA-Z0-9]/-/g')
  npm version prerelease --preid=${sanitized_branch} --no-git-tag-version
  INITIAL_VERSION=$(jq -r ".version" package.json)
  PREFIX=${INITIAL_VERSION%.*}
  echo "Checking registry for existing preview versions with prefix ${PREFIX}..."
  VIEW_REGISTRY="https://wombat-dressing-room.appspot.com"
  if [[ $USE_OSS_GATE == true ]]; then
    VIEW_REGISTRY="https://registry.npmjs.org"
  fi
  MATCHING_VERSIONS=$(npm view firebase-tools versions --registry "${VIEW_REGISTRY}" --json | jq -r --arg prefix "$PREFIX" 'if type == "array" then .[] else . end | select(startswith($prefix + "."))' || true)
  if [[ -n "$MATCHING_VERSIONS" ]]; then
    MAX_SUFFIX=$(echo "$MATCHING_VERSIONS" | sed 's/^.*\.//' | grep -E '^[0-9]+$' | sort -n | tail -n 1)
    MAX_SUFFIX=${MAX_SUFFIX:-0}
    NEXT_SUFFIX=$((MAX_SUFFIX + 1))
    NEW_VERSION="${PREFIX}.${NEXT_SUFFIX}"
    echo "Found existing preview versions. Bumping to ${NEW_VERSION}..."
    npm version "${NEW_VERSION}" --no-git-tag-version --allow-same-version
  else
    NEW_VERSION=$INITIAL_VERSION
    echo "No existing preview versions found. Using ${NEW_VERSION}."
  fi
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
  if [[ $USE_OSS_GATE == true ]]; then
    publish_to_oss_gate ""
  else
    echo "Publishing to npm..."
    npx clean-publish@5.0.0 --before-script ./scripts/clean-shrinkwrap.sh
    echo "Published to npm."
  fi

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
  if [[ $USE_OSS_GATE == true ]]; then
    publish_to_oss_gate "preview"
  else
    echo "Publishing preview version to npm..."
    npx clean-publish@5.0.0 --before-script ./scripts/clean-shrinkwrap.sh -- --tag preview
    echo "Published preview version to npm."
  fi
fi
