import http from 'http';
import fs from 'fs';
import path from 'path';
import { monitor } from './lib/gemini_monitor.js';
import { getRecipeIngredientsPricing } from './lib/infoprice.js';
import { ingestReel } from './ingest.js';

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve('public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  // API endpoint de monitoramento em tempo real do Gemini
  if (urlPath === '/api/gemini-usage') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(monitor.getDashboardStats(), null, 2));
    return;
  }

  // API endpoint para extração de receitas a partir do link do Reels (PWA / Web)
  if (urlPath === '/api/extract-reel') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e6) req.destroy();
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const rawUrl = (payload.url || '').trim();
          if (!rawUrl) {
            throw new Error('Informe o link do Reels do Instagram para extrair.');
          }

          console.log(`\n[API /api/extract-reel] Iniciando extração para: ${rawUrl}`);
          const newReel = await ingestReel(rawUrl);

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, reel: newReel }));
        } catch (err) {
          console.error('[API /api/extract-reel] Erro:', err.message);
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: false, error: 'Método não permitido. Use POST.' }));
    return;
  }

  // API endpoint de busca de preços de ingredientes locais via InfoPrice
  if (urlPath === '/api/ingredients-pricing') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 1e6) req.destroy();
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body || '{}');
          const result = await getRecipeIngredientsPricing({
            items: payload.items || [],
            cep: payload.cep || '04025010',
            raio: payload.raio || 5
          });
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const cep = urlObj.searchParams.get('cep') || '04025010';
    const raio = Number(urlObj.searchParams.get('raio')) || 5;
    const itemsParam = urlObj.searchParams.get('items');
    const items = itemsParam ? itemsParam.split(',').map(s => s.trim()).filter(Boolean) : [];

    getRecipeIngredientsPricing({ items, cep, raio })
      .then(result => {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result));
      })
      .catch(err => {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      });
    return;
  }

  // Proxy seguro de imagens de produtos (mascara a origem das imagens)
  if (urlPath === '/api/product-image') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const gtin = (urlObj.searchParams.get('gtin') || '').replace(/\D/g, '');
    if (!gtin) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('GTIN missing');
      return;
    }

    const paddedGtin = gtin.padStart(14, '0');
    const targetUrl = `https://s3.amazonaws.com/infoprice-prd-imagens/gtin/${paddedGtin}.jpg`;

    try {
      const imgRes = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      if (!imgRes.ok) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Image not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': imgRes.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=2592000, immutable'
      });
      const buffer = await imgRes.arrayBuffer();
      res.end(Buffer.from(buffer));
    } catch {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Error fetching product image');
    }
    return;
  }

  let filePath = path.join(PUBLIC_DIR, urlPath === '/' ? 'index.html' : urlPath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Suporte a Range Requests (HTTP 206) obrigatório para vídeos HTML5
    if (ext === '.mp4') {
      const range = req.headers.range;
      const fileSize = stats.size;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': contentType,
        };
        res.writeHead(206, head);
        file.pipe(res);
        return;
      } else {
        const head = {
          'Content-Length': fileSize,
          'Accept-Ranges': 'bytes',
          'Content-Type': contentType,
        };
        res.writeHead(200, head);
        fs.createReadStream(filePath).pipe(res);
        return;
      }
    }

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🧁 SweetReels rodando em: http://localhost:${PORT}`);
  console.log(`=================================================\n`);
});
