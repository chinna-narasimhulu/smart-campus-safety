import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { initDatabase } from './server/db.ts';
import { initRealtimeServer } from './server/realtime.ts';
import { adminRouter } from './server/routes/adminRoutes.ts';
import { authRouter } from './server/routes/authRoutes.ts';
import { incidentRouter } from './server/routes/incidentRoutes.ts';
import { publicRouter } from './server/routes/publicRoutes.ts';

async function startServer() {
  initDatabase();

  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.set('trust proxy', 1);

  // Baseline HTTP security headers (compatible with AI Studio preview iframe)
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self)');
    next();
  });

  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/incidents', incidentRouter);
  app.use('/api/admin', adminRouter);

  // Explicit 404 for unknown API routes so SPA fallback does not swallow API errors
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  const server = http.createServer(app);
  initRealtimeServer(server);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`Smart Campus Safety & Emergency Response System listening on port ${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
