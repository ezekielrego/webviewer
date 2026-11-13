import {getProxyOriginPrefix, PROXY_PREFIX} from '../utils/proxyUrl.ts';

export function buildIframeShimScriptTag(targetUrl: string): string {
  const parsed = new URL(targetUrl);
  const targetOrigin = parsed.origin;
  const proxyOriginPrefix = getProxyOriginPrefix(targetUrl) ?? '';
  const initialRealPath = `${parsed.pathname}${parsed.search}`;

  const configJson = JSON.stringify({
    targetOrigin,
    proxyOriginPrefix,
    proxyRoot: PROXY_PREFIX,
    initialRealPath,
  }).replace(/</g, '\\u003c');

  return `<script data-viewer-shim="1">
(function() {
  var cfg = ${configJson};
  var targetOrigin = cfg.targetOrigin;
  var proxyPrefix = cfg.proxyOriginPrefix;
  var proxyRoot = cfg.proxyRoot;

  var origPushState = History.prototype.pushState;
  var origReplaceState = History.prototype.replaceState;

  function toRealPath(urlStr) {
    if (!urlStr) return location.pathname + location.search + location.hash;
    try {
      var u = new URL(String(urlStr), targetOrigin + location.pathname);
      if (u.pathname.indexOf(proxyPrefix) === 0) {
        var trimmed = u.pathname.slice(proxyPrefix.length) || '/';
        return trimmed + u.search + u.hash;
      }
      if (u.origin === location.origin || u.origin === targetOrigin) {
        return u.pathname + u.search + u.hash;
      }
    } catch (_) {}
    return String(urlStr);
  }

  function notifyParent() {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'viewer:url-change',
          url: targetOrigin + location.pathname + location.search + location.hash,
          title: document.title || ''
        }, '*');
      }
    } catch (_) {}
  }

  // Synchronously restore real upstream pathname so SPA routers match routes cleanly
  try {
    var realTarget = cfg.initialRealPath + (location.hash || '');
    origReplaceState.call(history, history.state, '', realTarget);
  } catch (_) {}

  History.prototype.pushState = function(state, title, url) {
    var nextUrl = url !== undefined && url !== null ? toRealPath(url) : url;
    var res = origPushState.call(this, state, title, nextUrl);
    notifyParent();
    return res;
  };

  History.prototype.replaceState = function(state, title, url) {
    var nextUrl = url !== undefined && url !== null ? toRealPath(url) : url;
    var res = origReplaceState.call(this, state, title, nextUrl);
    notifyParent();
    return res;
  };

  window.addEventListener('popstate', notifyParent);
  window.addEventListener('DOMContentLoaded', notifyParent);
  window.addEventListener('load', notifyParent);

  function rewriteRequestUrl(raw) {
    if (typeof raw !== 'string') return raw;
    var s = raw.trim();
    if (!s || s.indexOf(proxyRoot + '/') === 0) return raw;
    if (/^(blob:|data:|javascript:|mailto:|tel:|#)/i.test(s)) return raw;

    // Root-relative path -> proxy through targetOrigin
    if (s.charAt(0) === '/' && s.charAt(1) !== '/') {
      return proxyPrefix + s;
    }

    // Same-origin absolute URL targeting the upstream origin -> proxy
    if (s.indexOf(targetOrigin + '/') === 0 || s === targetOrigin) {
      return proxyPrefix + (s.slice(targetOrigin.length) || '/');
    }

    // Relative path without leading slash (e.g. "assets/foo.js")
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) && s.indexOf('//') !== 0) {
      try {
        var resolved = new URL(s, targetOrigin + location.pathname);
        if (resolved.origin === targetOrigin) {
          return proxyPrefix + resolved.pathname + resolved.search + resolved.hash;
        }
      } catch (_) {}
    }

    // URL accidentally resolved against localhost:3000 instead of targetOrigin
    if (s.indexOf(location.origin + '/') === 0) {
      var rel = s.slice(location.origin.length);
      if (rel.indexOf(proxyRoot + '/') !== 0 && rel.indexOf('/__viewer') !== 0) {
        return proxyPrefix + rel;
      }
    }

    return raw;
  }

  function toProxiedNavigationUrl(raw) {
    try {
      var u = new URL(raw, targetOrigin + location.pathname);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        if (u.origin === location.origin) {
          if (u.pathname.indexOf(proxyRoot + '/') === 0) return u.toString();
          return proxyPrefix + u.pathname + u.search + u.hash;
        }
        return proxyRoot + '/' + u.protocol.slice(0, -1) + '/' + u.host + u.pathname + u.search + u.hash;
      }
    } catch (_) {}
    return raw;
  }

  // Patch fetch()
  if (typeof window.fetch === 'function') {
    var origFetch = window.fetch;
    window.fetch = function(input, init) {
      try {
        if (typeof input === 'string') {
          input = rewriteRequestUrl(input);
        } else if (input instanceof URL) {
          input = rewriteRequestUrl(input.toString());
        } else if (input && typeof input === 'object' && typeof input.url === 'string') {
          var next = rewriteRequestUrl(input.url);
          if (next !== input.url) {
            input = new Request(next, input);
          }
        }
      } catch (_) {}
      return origFetch.call(this, input, init);
    };
  }

  // Patch XMLHttpRequest.open
  var origXhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    var args = Array.prototype.slice.call(arguments);
    if (typeof url === 'string') {
      args[1] = rewriteRequestUrl(url);
    }
    return origXhrOpen.apply(this, args);
  };

  // Patch Worker for non-blob URLs
  if (typeof window.Worker === 'function') {
    var OrigWorker = window.Worker;
    window.Worker = function(scriptURL, options) {
      var nextUrl = typeof scriptURL === 'string'
        ? rewriteRequestUrl(scriptURL)
        : scriptURL instanceof URL
          ? rewriteRequestUrl(scriptURL.toString())
          : scriptURL;
      return new OrigWorker(nextUrl, options);
    };
    window.Worker.prototype = OrigWorker.prototype;
  }

  // Patch dynamic <script src> and <link href> insertions (e.g. Vite modulepreload)
  function patchAttrSetter(Proto, prop) {
    var desc = Object.getOwnPropertyDescriptor(Proto, prop);
    if (desc && desc.set && desc.get) {
      Object.defineProperty(Proto, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get,
        set: function(val) {
          return desc.set.call(this, typeof val === 'string' ? rewriteRequestUrl(val) : val);
        }
      });
    }
  }
  try {
    patchAttrSetter(HTMLScriptElement.prototype, 'src');
    patchAttrSetter(HTMLLinkElement.prototype, 'href');
    patchAttrSetter(HTMLImageElement.prototype, 'src');
  } catch (_) {}

  var origSetAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    var lower = String(name).toLowerCase();
    if ((lower === 'src' || lower === 'href') && typeof value === 'string') {
      if (this.tagName !== 'A') {
        value = rewriteRequestUrl(value);
      }
    }
    return origSetAttr.call(this, name, value);
  };

  // Intercept full-page link clicks so they stay inside the unrestricted proxy
  document.addEventListener('click', function(e) {
    if (e.defaultPrevented) return;
    var el = e.target;
    while (el && el.tagName !== 'A') {
      el = el.parentElement;
    }
    if (!el) return;
    var href = el.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^(javascript:|mailto:|tel:)/i.test(href)) return;
    e.preventDefault();
    var targetProxy = toProxiedNavigationUrl(href);
    location.assign(targetProxy);
  }, false);

  // Route window.open inside the viewer instead of failing popup blocks
  window.open = function(url) {
    if (url) {
      location.assign(toProxiedNavigationUrl(String(url)));
    }
    return window;
  };
})();
</script>`;
}
