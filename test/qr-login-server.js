import { createServer } from 'http';
import { URL } from 'url';
import Meting from '../src/meting.js';

const port = Number(process.env.PORT || 3000);
const corsOrigin = process.env.CORS_ORIGIN || '*';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseMetingResult(result) {
  return typeof result === 'string' ? JSON.parse(result) : result;
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === 'GET' && url.pathname === '/login/qr') {
      const server = url.searchParams.get('server') ||
        url.searchParams.get('platform') ||
        'netease';
      const meting = new Meting(server);
      const result = parseMetingResult(await meting.loginQr());
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/login/qr/check') {
      const state = url.searchParams.get('state');
      const key = url.searchParams.get('key');
      const server = url.searchParams.get('server') ||
        url.searchParams.get('platform') ||
        'netease';

      if (!state && !key) {
        sendJson(res, 400, {
          code: 400,
          message: 'Missing state or key query parameter'
        });
        return;
      }

      const meting = new Meting(server);
      const result = parseMetingResult(await meting.loginQrCheck(state || key));
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, {
      code: 404,
      message: 'Not found'
    });
  } catch (error) {
    sendJson(res, 500, {
      code: 500,
      message: error.message
    });
  }
});

server.listen(port, () => {
  console.log(`QR login server listening on http://localhost:${port}`);
});
