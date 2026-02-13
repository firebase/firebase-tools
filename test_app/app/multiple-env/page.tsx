function EnvVarsPage() {
  return (
    <div>
      <h2><strong>Environment Variables</strong></h2>
      <p>ENV_VAR_MULTIPLE_ENV: {process.env.ENV_VAR_MULTIPLE_ENV}</p>
    </div>
  );
}

export default EnvVarsPage;