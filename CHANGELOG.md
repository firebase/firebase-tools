- Implemented a check in the Next.js build function to verify if
  `.env.<PROJECT-ID>` file exists and make its variables available for the build
  process.
- Fix esbuild path used to bundle next.config.js on Windows (#7555)
- Support 3rd party builders for Angular.
