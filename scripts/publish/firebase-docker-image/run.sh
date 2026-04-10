## Script for testing Docker image creation without running a full release.
PROJECT_ID=$1
REPO_NAME=${2:-us}
npm i
gcloud --project $PROJECT_ID \
  builds \
  submit \
  --substitutions=_REPO_NAME=$REPO_NAME