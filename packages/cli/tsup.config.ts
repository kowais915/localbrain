import { defineConfig } from 'tsup'

// Production build for the single published `localbrain` package.
// The internal @localbrain/* workspace packages are bundled in (noExternal)
// so npm consumers get one self-contained package. node-llama-cpp stays
// external so its prebuilt native binaries resolve at install time.
export default defineConfig({
  entry: {
    cli: 'src/cli.ts',   // the `localbrain` bin
    index: 'src/index.ts' // the `import { ai } from 'localbrain'` entry
  },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  tsconfig: 'tsconfig.build.json',
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  noExternal: [
    'localbrain-client',
    '@localbrain/detection',
    '@localbrain/runtime',
    '@localbrain/adapters'
  ],
  external: ['node-llama-cpp']
  // The shebang lives at the top of src/cli.ts and is preserved by tsup for
  // the cli entry only, so index.js (the library entry) stays shebang-free.
})
