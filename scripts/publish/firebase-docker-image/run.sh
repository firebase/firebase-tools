## Script for testing Docker image creation without running a full release.
PROJECT_ID=$1
gcloud --project $PROJECT_ID \
  builds \
  submit