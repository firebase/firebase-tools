import Link from "next/link";
import { ReactNode } from "react";

interface FeatureCardProps {
  title: string;
  children: ReactNode;
}
export function FeatureCard({title, children }: FeatureCardProps) {
  return <article className="card">
          <h2>{title}</h2>
          {children}
        </article>
}

export default function Home() {
  return (
    <main className="content">
    <h1 className="heading">Next.js on Firebase App Hosting <br />and <br /> Firebase Data Connect</h1>
      <section className="features">
        <FeatureCard title="Data Connect">
          <p>CloudSQL Database served by Firebase Data Connect.</p>
        </FeatureCard>
        <FeatureCard title="Scalable, serverless backends">
          <p>
            Dynamic content is served by{" "}
            <Link
              href="https://cloud.google.com/run/docs/overview/what-is-cloud-run"
              target="_blank"
              rel="noopener noreferrer"
            >
              Cloud Run
            </Link>
            , a fully managed container that scales up and down with demand. Visit{" "}
            <Link href="/ssr">
              <code>/ssr</code>
            </Link>{" "}
            and{" "}
            <Link href="/ssr/streaming">
              <code>/ssr/streaming</code>
            </Link>{" "}
            to see the server in action.
          </p>
        </FeatureCard>
        <FeatureCard title="Global CDN">
          <p>
            Cached content is served by{" "}
            <Link
              href="https://cloud.google.com/cdn/docs/overview"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Cloud CDN
            </Link>
            , a fast and secure way to host cached content globally. Visit
            <Link href="/ssg">
              {" "}
              <code>/ssg</code>
            </Link>{" "}
          </p>
        </FeatureCard>
      </section>
    </main>
  );
}
