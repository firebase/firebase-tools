// This page contains one number that will be updated at the start of each GitHub Actions workflow run.
// This is the timestamp that the workflow started, and is passed to the app as an environment variable.
// This allows us to verify that the app is being rebuilt and redeployed on each workflow run properly.

function TimestampPage() {
  return (
    <div>
      <h2><strong>Start Time of GitHub Run</strong></h2>
      <p>1769012304</p>
    </div>
  );
}

export default TimestampPage;