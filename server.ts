import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  proxyRequestToTarget,
  resolveFallbackUpstreamOrigin,
} from './src/proxy/proxyHandler.ts';
import {fromProxyPath, isViewerInternalPath} from './src/utils/proxyUrl.ts';

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.disable('x-powered-by');

  app.get('/__viewer_api/health', (_req, res) => {
    res.json({ok: true});
  });

  // Explicit reverse proxy endpoint: /__p/:protocol/:host/...
  app.use('/__p', async (req, res) => {
    const targetUrl = fromProxyPath(req.originalUrl);
    if (!targetUrl) {
      res.status(400).json({error: 'Malformed proxy URL'});
      return;
    }
    await proxyRequestToTarget(req, res, targetUrl);
  });

  // Fallback proxy for dynamically constructed root-relative requests (e.g. /assets/*, /_serverFn/*, /project/*)
  app.use(async (req, res, next) => {
    if (isViewerInternalPath(req.path)) {
      next();
      return;
    }
    const upstreamOrigin = resolveFallbackUpstreamOrigin(req);
    if (!upstreamOrigin) {
      next();
      return;
    }
    const targetUrl = `${upstreamOrigin}${req.originalUrl}`;
    await proxyRequestToTarget(req, res, targetUrl);
  });

  if (!isProd) {
    const {createServer: createViteServer} = await import('vite');
    const vite = await createViteServer({
      server: {middlewareMode: true},
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Marble Unrestricted Viewer listening on http://0.0.0.0:${port}`);
  });
}

startServer();
