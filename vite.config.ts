import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

function collectRelativeDistFiles(dir: string, baseDir: string = dir): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectRelativeDistFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, fullPath).split(path.sep).join('/');
      if (rel === 'sw.js' || rel.endsWith('.map') || entry.name === '.DS_Store') {
        continue;
      }
      results.push(`./${rel}`);
    }
  }
  return results;
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
      // Injects the exact built relative asset list and content hash into dist/sw.js
      // so GitHub Pages deployments cache the full offline app shell on first load.
      {
        name: 'inject-relative-sw-precache',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const swPath = path.join(distDir, 'sw.js');
          if (!fs.existsSync(distDir) || !fs.existsSync(swPath)) {
            return;
          }
          const files = ['./', ...collectRelativeDistFiles(distDir).sort()];
          const hash = crypto.createHash('sha256');
          for (const rel of files) {
            if (rel === './') continue;
            const full = path.join(distDir, rel.slice(2));
            if (fs.existsSync(full)) {
              hash.update(rel);
              hash.update(fs.readFileSync(full));
            }
          }
          const buildVersion = hash.digest('hex').slice(0, 12);
          let swSource = fs.readFileSync(swPath, 'utf8');
          swSource = swSource.replace(
            /const CACHE_VERSION = '[^']*';/,
            `const CACHE_VERSION = '${buildVersion}';`
          );
          swSource = swSource.replace(
            /const PRECACHE_ASSETS = \[[\s\S]*?\];/,
            `const PRECACHE_ASSETS = ${JSON.stringify(files, null, 2)};`
          );
          fs.writeFileSync(swPath, swSource, 'utf8');
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
