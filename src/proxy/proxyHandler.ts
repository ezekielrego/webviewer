import type {Request, Response} from 'express';
import {
  fromProxyPath,
  rewriteCssForProxy,
  rewriteHtmlForProxy,
  rewriteRedirectLocation,
} from '../utils/proxyUrl.ts';
import {buildIframeShimScriptTag} from './iframeShim.ts';

const STRIPPED_RESPONSE_HEADERS = new Set([
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-content-security-policy',
  'x-webkit-csp',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
  'strict-transport-security',
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
]);

const STRIPPED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'origin',
  'referer',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-user',
  'upgrade-insecure-requests',
]);

export function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    if (key === name) {
      try {
        return decodeURIComponent(part.slice(eqIdx + 1).trim());
      } catch {
        return part.slice(eqIdx + 1).trim();
      }
    }
  }
  return null;
}

function readRawBody(req: Request): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      resolve(chunks.length > 0 ? Buffer.concat(chunks) : undefined);
    });
    req.on('error', reject);
  });
}

function sanitizeSetCookie(rawCookie: string, isHttpsRequest: boolean): string {
  // Remove Domain= so cookies bind to the viewer origin, and strip our internal cookie if needed
  let cleaned = rawCookie.replace(/;\s*domain=[^;]*/gi, '');
  if (!isHttpsRequest) {
    cleaned = cleaned.replace(/;\s*secure/gi, '');
    cleaned = cleaned.replace(/;\s*samesite=none/gi, '; SameSite=Lax');
  } else {
    if (!/;\s*samesite=/i.test(cleaned)) {
      cleaned += '; SameSite=None; Secure';
    }
  }
  return cleaned;
}

export async function proxyRequestToTarget(
  req: Request,
  res: Response,
  targetUrl: string,
): Promise<void> {
  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    res.status(400).json({error: 'Invalid target URL'});
    return;
  }

  const upstreamHeaders = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (STRIPPED_REQUEST_HEADERS.has(lower) || value === undefined) continue;
    if (lower === 'cookie') {
      // Strip internal proxy session cookie before sending upstream
      const filtered = String(value)
        .split(';')
        .map((c) => c.trim())
        .filter((c) => c && !c.startsWith('__viewer_upstream_origin='))
        .join('; ');
      if (filtered) upstreamHeaders.set('cookie', filtered);
      continue;
    }
    upstreamHeaders.set(key, Array.isArray(value) ? value.join(', ') : String(value));
  }

  upstreamHeaders.set('origin', parsedTarget.origin);
  upstreamHeaders.set('referer', `${parsedTarget.origin}/`);
  if (!upstreamHeaders.has('user-agent')) {
    upstreamHeaders.set(
      'user-agent',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    );
  }

  try {
    const body = await readRawBody(req);
    const upstreamResponse = await fetch(targetUrl, {
      method: req.method,
      headers: upstreamHeaders,
      body: body ? new Uint8Array(body) : undefined,
      redirect: 'manual',
    });

    const isHttpsRequest =
      req.secure || req.headers['x-forwarded-proto'] === 'https';

    // Handle redirects manually so they stay within /__p/...
    if (
      upstreamResponse.status >= 300 &&
      upstreamResponse.status < 400 &&
      upstreamResponse.headers.has('location')
    ) {
      const loc = upstreamResponse.headers.get('location')!;
      const rewrittenLoc = rewriteRedirectLocation(loc, targetUrl);
      res.status(upstreamResponse.status);
      res.setHeader('Location', rewrittenLoc);
      res.end();
      return;
    }

    res.status(upstreamResponse.status);

    upstreamResponse.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (STRIPPED_RESPONSE_HEADERS.has(lower)) return;
      if (lower === 'set-cookie') return;
      res.setHeader(key, value);
    });

    const setCookies =
      typeof upstreamResponse.headers.getSetCookie === 'function'
        ? upstreamResponse.headers.getSetCookie()
        : [];
    const outCookies = setCookies.map((c) => sanitizeSetCookie(c, isHttpsRequest));

    const contentType = upstreamResponse.headers.get('content-type') || '';
    const isHtml = contentType.toLowerCase().includes('text/html');
    const isCss = contentType.toLowerCase().includes('text/css');

    if (isHtml) {
      const cookieAttrs = isHttpsRequest
        ? 'Path=/; SameSite=None; Secure'
        : 'Path=/; SameSite=Lax';
      outCookies.push(
        `__viewer_upstream_origin=${encodeURIComponent(parsedTarget.origin)}; ${cookieAttrs}`,
      );
    }

    if (outCookies.length > 0) {
      res.setHeader('Set-Cookie', outCookies);
    }

    // Permit cross-origin workers/scripts inside viewer
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    if (isHtml) {
      const htmlText = await upstreamResponse.text();
      const shimTag = buildIframeShimScriptTag(targetUrl);
      const rewrittenHtml = rewriteHtmlForProxy(htmlText, targetUrl, shimTag);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(rewrittenHtml);
      return;
    }

    if (isCss) {
      const cssText = await upstreamResponse.text();
      const rewrittenCss = rewriteCssForProxy(cssText, targetUrl);
      res.setHeader('Content-Type', contentType || 'text/css; charset=utf-8');
      res.send(rewrittenCss);
      return;
    }

    const arrayBuf = await upstreamResponse.arrayBuffer();
    res.send(Buffer.from(arrayBuf));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream fetch failed';
    if (!res.headersSent) {
      res.status(502).send(
        `<!doctype html><html><body style="background:#111317;color:#e4e4e7;font-family:sans-serif;padding:32px;"><h2>Proxy Connection Error</h2><p>${message.replace(/</g, '&lt;')}</p></body></html>`,
      );
    }
  }
}

export function resolveFallbackUpstreamOrigin(req: Request): string | null {
  const referer = req.headers.referer;
  if (referer) {
    try {
      const refUrl = new URL(referer);
      const fromRef = fromProxyPath(`${refUrl.pathname}${refUrl.search}`);
      if (fromRef) {
        return new URL(fromRef).origin;
      }
    } catch {
      // ignore invalid referer
    }
  }
  const cookieOrigin = parseCookieValue(req.headers.cookie, '__viewer_upstream_origin');
  if (cookieOrigin) {
    try {
      return new URL(cookieOrigin).origin;
    } catch {
      return null;
    }
  }
  return null;
}
