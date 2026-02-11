import Link from 'next/link';
import Image from 'next/image';

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-50">
      <div className="text-center">
        {/* Flex container for logos */}
        <div className="flex justify-center items-center gap-8 mb-8">
          <Image
            src="/fah.svg"
            alt="Firebase App Hosting Logo"
            width={100}
            height={100}
            priority
          />
          <Image
            src="/next.svg"
            alt="Next.js Logo"
            width={180}
            height={37}
            priority
          />
        </div>
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          Welcome to the Firebase App Hosting NextJS Kitchen Sink App
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          This is the main landing page of the application. Here you can find links to various features and sections of the app.
        </p>

        <div className="flex flex-col items-center gap-4">
          <Link
            href="/timestamp/prod-us-central1"
            className="inline-block px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
          >
            Timestamp - /timestamp/prod-us-central1
          </Link>
          <Link
            href="/timestamp/prod-asia-east1"
            className="inline-block px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
          >
            Timestamp - /timestamp/prod-asia-east1
          </Link>
          <Link
            href="/timestamp/staging-us-west1"
            className="inline-block px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
          >
            Timestamp - /timestamp/staging-us-west1
          </Link>
          <Link
            href="/env-vars"
            className="inline-block px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
          >
            Environment Variables - /env-vars
          </Link>
          <Link
            href="/secrets"
            className="inline-block px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
          >
            Secrets - /secrets
          </Link>
          <Link
            href="/sdk-autoinit"
            className="inline-block px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
          >
            SDK AutoInit - /sdk-autoinit
          </Link>
          <Link
            href="/multiple-env"
            className="inline-block px-6 py-3 text-lg font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors"
          >
            Multiple Environments - /multiple-env
          </Link>
        </div>

      </div>
    </main>
  );
}