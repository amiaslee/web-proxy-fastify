import { defineConfig } from '@rslib/core';

export default defineConfig({
  lib: [
    {
      format: 'cjs',
      source: {
        entry: {
          index: './src/server.ts',
        },
      },
      bundle: true,
      dts: false,
    },
  ],
  output: {
    target: 'node',
    externals: [/node_modules/], // Externalize all node_modules
  },
});
