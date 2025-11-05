import Link from "next/link";

export default function Page() {
  return (
    <main className="content">
      <h1 className="heading">ISR Demo</h1>

      <section className="data-container">
        <article className="card">
          <h2>
            <Link href="/isr/time" className="link">
              Time-based revalidation
            </Link>
          </h2>
        </article>
        <article className="card">
          <h2>
            <Link href="/isr/demand" className="link">
              On-demand revalidation
            </Link>
          </h2>
        </article>
      </section>
    </main>
  );
}
