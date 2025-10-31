import { getDateString, getRandomUUID } from "../../utils";

export const revalidate = 10;

export default function Page() {
  return (
    <main className="content">
      <header>
        <h1 className="heading">A cached page</h1>

        <h2>(should be regenerated every 10 seconds)</h2>
      </header>

      <section className="data-container">
        <article className="card">
          <p>Generated</p>
          <h2>{getDateString()}</h2>
        </article>
        <article className="card">
          <p>UUID</p>
          <h2>{getRandomUUID()}</h2>
        </article>
      </section>
    </main>
  );
}
