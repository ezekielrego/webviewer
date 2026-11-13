export const DEFAULT_TARGET_URL =
  'https://marble.worldlabs.ai/project/3b0b6c18-9f3d-4e2f-ad8c-71f3f51dc46a';

export const PROXY_PREFIX = '/__p';

export function normalizeUserUrl(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Reject dangerous or non-web schemes explicitly
  if (/^(javascript|data|vbscript|file|about):/i.test(trimmed)) {
    return null;
  }

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function getProxyOriginPrefix(targetUrl: string): string | null {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const proto = parsed.protocol.slice(0, -1); // 'http' | 'https'
    return `${PROXY_PREFIX}/${proto}/${parsed.host}`;
  } catch {
    return null;
  }
}

export function toProxyPath(targetUrl: string): string {
  const parsed = new URL(targetUrl);
  const proto = parsed.protocol.slice(0, -1);
  return `${PROXY_PREFIX}/${proto}/${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function fromProxyPath(proxyPathWithQuery: string): string | null {
  if (!proxyPathWithQuery.startsWith(`${PROXY_PREFIX}/`)) {
    return null;
  }
  const rest = proxyPathWithQuery.slice(PROXY_PREFIX.length + 1);
  const slashIdx = rest.indexOf('/');
  if (slashIdx <= 0) return null;

  const proto = rest.slice(0, slashIdx).toLowerCase();
  if (proto !== 'http' && proto !== 'https') return null;

  const afterProto = rest.slice(slashIdx + 1);
  if (!afterProto) return null;

  const pathSlashIdx = afterProto.indexOf('/');
  const queryIdx = afterProto.indexOf('?');
  let hostEnd = afterProto.length;
  if (pathSlashIdx !== -1) hostEnd = Math.min(hostEnd, pathSlashIdx);
  if (queryIdx !== -1) hostEnd = Math.min(hostEnd, queryIdx);

  const host = afterProto.slice(0, hostEnd);
  if (!host) return null;

  const tail = afterProto.slice(hostEnd);
  const normalizedTail = tail.startsWith('?')
    ? `/${tail}`
    : tail || '/';

  return `${proto}://${host}${normalizedTail}`;
}

export function rewriteRedirectLocation(
  locationHeader: string,
  baseTargetUrl: string,
): string {
  try {
    const resolved = new URL(locationHeader, baseTargetUrl);
    if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
      return toProxyPath(resolved.toString());
    }
    return locationHeader;
  } catch {
    return locationHeader;
  }
}

export function isViewerInternalPath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/index.html') return true;
  if (pathname.startsWith('/__viewer')) return true;
  if (pathname.startsWith('/__p/') || pathname === '/__p') return true;
  if (pathname.startsWith('/src/')) return true;
  if (pathname.startsWith('/@')) return true;
  if (pathname.startsWith('/node_modules/')) return true;
  return false;
}

function rewriteAssetUrl(rawUrl: string, targetOrigin: string, proxyOriginPrefix: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return rawUrl;
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith(`${PROXY_PREFIX}/`)
  ) {
    return rawUrl;
  }

  if (trimmed.startsWith(`${targetOrigin}/`) || trimmed === targetOrigin) {
    const suffix = trimmed.slice(targetOrigin.length) || '/';
    return `${proxyOriginPrefix}${suffix}`;
  }

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return `${proxyOriginPrefix}${trimmed}`;
  }

  return rawUrl;
}

function rewriteSrcset(srcsetValue: string, targetOrigin: string, proxyOriginPrefix: string): string {
  return srcsetValue
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return candidate;
      const parts = trimmed.split(/\s+/);
      const rewrittenUrl = rewriteAssetUrl(parts[0], targetOrigin, proxyOriginPrefix);
      return parts.length > 1 ? `${rewrittenUrl} ${parts.slice(1).join(' ')}` : rewrittenUrl;
    })
    .join(', ');
}

export function rewriteHtmlForProxy(
  html: string,
  targetUrl: string,
  shimScriptTag: string,
): string {
  const parsed = new URL(targetUrl);
  const targetOrigin = parsed.origin;
  const proxyOriginPrefix = getProxyOriginPrefix(targetUrl);
  if (!proxyOriginPrefix) return html;

  // Strip integrity attributes so rewritten/proxied scripts & styles are never blocked by SRI
  let output = html.replace(/\sintegrity\s*=\s*(["'])[^"']*\1/gi, '');

  // Rewrite standard URL attributes on HTML tags without touching inline script bodies
  output = output.replace(
    /(<(?:a|area|base|embed|form|frame|iframe|img|input|link|script|source|track|video|audio)\b[^>]*?\s(?:href|src|action|poster|data-src)\s*=\s*)(["'])([^"']*)\2/gi,
    (_match, prefix: string, quote: string, value: string) => {
      const next = rewriteAssetUrl(value, targetOrigin, proxyOriginPrefix);
      return `${prefix}${quote}${next}${quote}`;
    },
  );

  // Rewrite srcset attributes
  output = output.replace(
    /(<(?:img|source)\b[^>]*?\ssrcset\s*=\s*)(["'])([^"']*)\2/gi,
    (_match, prefix: string, quote: string, value: string) => {
      const next = rewriteSrcset(value, targetOrigin, proxyOriginPrefix);
      return `${prefix}${quote}${next}${quote}`;
    },
  );

  // Inject our synchronous head shim immediately after <head...>
  if (/<head(\s[^>]*)?>/i.test(output)) {
    output = output.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${shimScriptTag}`);
  } else if (/<html(\s[^>]*)?>/i.test(output)) {
    output = output.replace(/<html(\s[^>]*)?>/i, (m) => `${m}<head>${shimScriptTag}</head>`);
  } else {
    output = `${shimScriptTag}${output}`;
  }

  return output;
}

export function rewriteCssForProxy(css: string, targetUrl: string): string {
  const parsed = new URL(targetUrl);
  const targetOrigin = parsed.origin;
  const proxyOriginPrefix = getProxyOriginPrefix(targetUrl);
  if (!proxyOriginPrefix) return css;

  return css.replace(
    /url\(\s*(["']?)([^"')]+)\1\s*\)/gi,
    (match, quote: string, urlVal: string) => {
      const next = rewriteAssetUrl(urlVal, targetOrigin, proxyOriginPrefix);
      if (next === urlVal) return match;
      return `url(${quote}${next}${quote})`;
    },
  );
}
