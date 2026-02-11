function EnvVarsPage() {
  return (
    <div>
      <h2><strong>Environment Variables</strong></h2>
      <p>ENV_VAR_1: {process.env.ENV_VAR_1}</p>
      <p>ENV_VAR_2: {process.env.ENV_VAR_2}</p>
      <p>NEXT_PUBLIC_ENV_VAR_3: {process.env.NEXT_PUBLIC_ENV_VAR_3}</p>
    </div>
  );
}

export default EnvVarsPage;