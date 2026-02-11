function SecretsPage() {
  return (
    <div>
      <h2><strong>Environment Variables</strong></h2>
      <p>API_KEY: {process.env.API_KEY}</p>
      <p>PINNED_API_KEY: {process.env.PINNED_API_KEY}</p>
    </div>
  );
}

export default SecretsPage;