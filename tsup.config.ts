import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/testing/**/*',
    '!src/test/**/*'
  ],
  format: ['cjs'],
  outDir: 'lib',
  clean: false,
  target: 'es2020',
  dts: true,
  sourcemap: true,
})