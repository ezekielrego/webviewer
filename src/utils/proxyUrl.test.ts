import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TARGET_URL,
  fromProxyPath,
  isViewerInternalPath,
  normalizeUserUrl,
  rewriteCssForProxy,
  rewriteHtmlForProxy,
  rewriteRedirectLocation,
  toProxyPath,
} from './proxyUrl.ts';

test('normalizeUserUrl handles valid URLs and rejects unsafe schemes', () => {
  assert.equal(
    normalizeUserUrl('https://marble.worldlabs.ai/project/3b0b6c18-9f3d-4e2f-ad8c-71f3f51dc46a'),
    DEFAULT_TARGET_URL,
  );
  assert.equal(normalizeUserUrl('marble.worldlabs.ai'), 'https://marble.worldlabs.ai/');
  assert.equal(normalizeUserUrl('  '), null);
  assert.equal(normalizeUserUrl('javascript:alert(1)'), null);
  assert.equal(normalizeUserUrl('data:text/html,hi'), null);
  assert.equal(normalizeUserUrl('file:///etc/passwd'), null);
});

test('toProxyPath and fromProxyPath round-trip target URLs cleanly', () => {
  const proxied = toProxyPath(DEFAULT_TARGET_URL);
  assert.equal(
    proxied,
    '/__p/https/marble.worldlabs.ai/project/3b0b6c18-9f3d-4e2f-ad8c-71f3f51dc46a',
  );
  assert.equal(fromProxyPath(proxied), DEFAULT_TARGET_URL);

  const withQuery = 'https://marble.worldlabs.ai/_serverFn/abc?payload=%7B%22id%22%3A1%7D';
  assert.equal(fromProxyPath(toProxyPath(withQuery)), withQuery);
  assert.equal(fromProxyPath('/not-a-proxy-path'), null);
});

test('rewriteRedirectLocation resolves relative and absolute locations into proxy paths', () => {
  assert.equal(
    rewriteRedirectLocation('/login?next=1', DEFAULT_TARGET_URL),
    '/__p/https/marble.worldlabs.ai/login?next=1',
  );
  assert.equal(
    rewriteRedirectLocation('https://auth.worldlabs.ai/oauth', DEFAULT_TARGET_URL),
    '/__p/https/auth.worldlabs.ai/oauth',
  );
});

test('rewriteHtmlForProxy rewrites root-relative assets, strips integrity, and injects shim', () => {
  const html =
    '<!doctype html><html><head><link rel="stylesheet" href="/assets/app.css" integrity="sha384-abc"/><script type="module" src="/assets/main.js"></script></head><body><a href="/worlds">Worlds</a></body></html>';
  const shim = '<script data-viewer-shim="1">/*shim*/</script>';
  const out = rewriteHtmlForProxy(html, DEFAULT_TARGET_URL, shim);

  assert.match(out, /<head><script data-viewer-shim="1">\/\*shim\*\/<\/script>/);
  assert.match(out, /href="\/__p\/https\/marble\.worldlabs\.ai\/assets\/app\.css"/);
  assert.match(out, /src="\/__p\/https\/marble\.worldlabs\.ai\/assets\/main\.js"/);
  assert.doesNotMatch(out, /integrity=/);
});

test('rewriteCssForProxy rewrites root-relative css url() references', () => {
  const css = '@font-face{src:url(/fonts/inter.woff2) format("woff2");background:url("data:image/png;base64,AAA")}';
  const out = rewriteCssForProxy(css, DEFAULT_TARGET_URL);
  assert.match(out, /url\(\/__p\/https\/marble\.worldlabs\.ai\/fonts\/inter\.woff2\)/);
  assert.match(out, /url\("data:image\/png;base64,AAA"\)/);
});

test('isViewerInternalPath protects app routes from fallback proxying', () => {
  assert.equal(isViewerInternalPath('/'), true);
  assert.equal(isViewerInternalPath('/src/App.tsx'), true);
  assert.equal(isViewerInternalPath('/@vite/client'), true);
  assert.equal(isViewerInternalPath('/__viewer_assets/index.js'), true);
  assert.equal(isViewerInternalPath('/assets/index-9_yVle4u.js'), false);
  assert.equal(isViewerInternalPath('/_serverFn/abc'), false);
});
