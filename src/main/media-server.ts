import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

let server: http.Server | null = null;
let port = 0;

// Maps session IDs to their directory paths
const sessionDirs = new Map<string, string>();

const MIME_TYPES: Record<string, string> = {
  '.mpd': 'application/dash+xml',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
};

export function getMediaServerPort(): number {
  return port;
}

export function registerSessionDir(sessionId: string, dir: string): void {
  sessionDirs.set(sessionId, dir);
}

export function startMediaServer(): Promise<void> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      // URL format: /<sessionId>/<filename>
      // This allows dashjs relative URL resolution to work naturally
      const url = new URL(req.url || '/', `http://localhost`);
      const parts = url.pathname.split('/').filter(Boolean);

      if (parts.length !== 2) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const [sessionId, fileName] = parts;
      const dir = sessionDirs.get(sessionId);

      if (!dir) {
        res.writeHead(404);
        res.end('Session not found');
        return;
      }

      // Prevent path traversal
      const safeName = path.basename(decodeURIComponent(fileName));
      const filePath = path.join(dir, safeName);

      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }

      const ext = path.extname(safeName).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      });

      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server!.address();
      if (addr && typeof addr === 'object') {
        port = addr.port;
      }
      resolve();
    });
  });
}
