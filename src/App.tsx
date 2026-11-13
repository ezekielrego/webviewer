import {useMemo} from 'react';
import {
  DEFAULT_TARGET_URL,
  normalizeUserUrl,
  toProxyPath,
} from './utils/proxyUrl';

export default function App() {
  const targetUrl = useMemo(() => {
    const paramUrl = new URLSearchParams(window.location.search).get('url');
    if (paramUrl) {
      const normalized = normalizeUserUrl(paramUrl);
      if (normalized && new URL(normalized).origin !== window.location.origin) {
        return normalized;
      }
    }
    return DEFAULT_TARGET_URL;
  }, []);

  const proxySrc = toProxyPath(targetUrl);

  return (
    <main className="h-screen w-screen overflow-hidden bg-[#181A20]">
      <iframe
        data-testid="viewer-frame"
        title="Unrestricted Web Viewer"
        src={proxySrc}
        allow="fullscreen; accelerometer; gyroscope; xr-spatial-tracking; clipboard-read; clipboard-write"
        className="block h-full w-full border-0 bg-[#181A20]"
      />
    </main>
  );
}
