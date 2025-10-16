import { getDateString, getRandomUUID } from "../../utils";
import { RegenerateButton } from "./RegenerateButton";

export default function Page() {
  return (
    <main className="content">
      <h1 className="heading">A cached page</h1>

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

      <RegenerateButton />
    </main>
  );
}
