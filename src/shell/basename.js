// Leaf helper (no imports): router basename derived from the build's asset prefix.
// Rsbuild injects `import.meta.env.ASSET_PREFIX` = output.assetPrefix in prod builds
// ('/gameServer/db') and dev.assetPrefix in dev (default '/'), so dev at :3000 gets ''.
export function computeBasename(prefix) {
  if (typeof prefix !== 'string') return '';
  const p = prefix.trim().replace(/\/+$/, '');
  return p.startsWith('/') ? p : '';
}

export const ROUTER_BASENAME = computeBasename(import.meta.env && import.meta.env.ASSET_PREFIX);
