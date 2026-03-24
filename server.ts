import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '2mb' }));

const AHMINIX_BASE = (process.env.AHMINIX_API_BASE || 'https://store.ahminix.com/client/api').replace(/\/+$/, '');
const AHMINIX_TOKEN = process.env.AHMINIX_API_TOKEN || '';

if (!AHMINIX_TOKEN) {
  console.warn('AHMINIX_API_TOKEN is missing. API calls will fail until it is configured.');
}

async function proxyToAhminix(req: express.Request, res: express.Response) {
  try {
    if (!AHMINIX_TOKEN) {
      return res.status(500).json({ status: 'ERROR', error: 'Missing AHMINIX_API_TOKEN' });
    }

    const upstreamPath = req.originalUrl.replace(/^\/api\/ahminix/, '') || '/';
    const targetUrl = new URL(upstreamPath, `${AHMINIX_BASE}/`);

    const headers: Record<string, string> = {
      'api-token': AHMINIX_TOKEN,
      Accept: 'application/json',
    };

    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (!['GET', 'HEAD'].includes(req.method)) {
      headers['Content-Type'] = 'application/json';
      init.body = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : undefined;
    }

    const upstream = await fetch(targetUrl, init);
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json; charset=utf-8');
    res.send(text);
  } catch (error: any) {
    res.status(500).json({ status: 'ERROR', error: error?.message || 'Proxy error' });
  }
}

app.all('/api/ahminix', proxyToAhminix);
app.all('/api/ahminix/*', proxyToAhminix);
app.get('/api/health', (_req, res) => res.json({ status: 'OK' }));

async function start() {
  const distIndex = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(distIndex)) {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => res.sendFile(distIndex));
  } else {
    const vite = await createViteServer({
      root: __dirname,
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        let html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
        html = await vite.transformIndexHtml(url, html);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
