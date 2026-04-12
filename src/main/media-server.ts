import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

let server: http.Server | null = null;
let port = 0;

// Maps session IDs to their directory paths
const sessionDirs = new Map<string, string>();

const MIME_TYPES: Record<string, string> = {
  '.mpd': 'application/dash+xml',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
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
      const url = new URL(req.url || '/', `http://localhost`);
      const parts = url.pathname.split('/').filter(Boolean);

      // Serve thumbnails: /thumbnail/<filename>
      if (parts.length === 2 && parts[0] === 'thumbnail') {
        const fileName = decodeURIComponent(parts[1]);
        const thumbnailDir = path.join(app.getPath('userData'), 'steam-thumbnails');
        const safeName = path.basename(fileName); // Prevent path traversal
        const filePath = path.join(thumbnailDir, safeName);

        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end('Thumbnail not found');
          return;
        }

        const ext = path.extname(safeName).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'image/jpeg';

        try {
          const stat = fs.statSync(filePath);
          res.writeHead(200, {
            'Content-Type': contentType,
            'Content-Length': stat.size,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'max-age=86400', // Cache thumbnails for 1 day
          });
          fs.createReadStream(filePath).pipe(res);
        } catch (err) {
          console.error(`Error serving thumbnail ${filePath}:`, err);
          res.writeHead(500);
          res.end('Error serving thumbnail');
        }
        return;
      }

      // Serve DASH media: /<sessionId>/<filename>
      // This allows dashjs relative URL resolution to work naturally
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
