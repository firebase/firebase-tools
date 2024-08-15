- Implemented a check in the Next.js build function to verify if
  `.env.<PROJECT-ID>` file exists and make its variables available for the build
  process.
- Fix esbuild path used to bundle next.config.js on Windows (#7555)
- Updated to v1.3.5 of the Data Connect toolkit, which adds support for pgvector indexing and `order_by_ref`, and fixes bugs in SDK generation.
