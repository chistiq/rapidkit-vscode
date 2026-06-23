const esbuild = require('esbuild');
const path = require('path');
const postcss = require('postcss');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const fs = require('fs');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] webview build started');
    });
    build.onEnd(result => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] webview build finished');
    });
  },
};

// PostCSS plugin for Tailwind
const postcssPlugin = {
  name: 'postcss',
  setup(build) {
    build.onLoad({ filter: /\.css$/ }, async (args) => {
      const css = await fs.promises.readFile(args.path, 'utf8');
      const result = await postcss([tailwindcss, autoprefixer]).process(css, {
        from: args.path,
      });
      return {
        contents: result.css,
        loader: 'css',
      };
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: {
      webview: 'src/index.tsx',
      sidebar: 'src/sidebar/index.tsx',
    },
    bundle: true,
    format: 'iife',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    outdir: '../dist',
    logLevel: 'silent',
    plugins: [esbuildProblemMatcherPlugin, postcssPlugin],
    
    // Path aliases
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@workspai-contracts': path.resolve(__dirname, '../src/contracts'),
    },
    
    // JSX configuration for React
    jsx: 'automatic',
    
    // Optimization settings
    treeShaking: true,
    
    // Production optimizations
    ...(production && {
      drop: ['console', 'debugger'],
      legalComments: 'none',
    }),
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
