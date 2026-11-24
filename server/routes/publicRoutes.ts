import express from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { db } from '../db.ts';

export const publicRouter = express.Router();

publicRouter.get('/emergency-contacts', (_req, res) => {
  const contacts = db
    .prepare('SELECT * FROM emergency_contacts WHERE is_active = 1 ORDER BY priority_order ASC, name ASC')
    .all();
  res.json({ contacts });
});

publicRouter.get('/categories', (_req, res) => {
  const categories = db
    .prepare('SELECT * FROM incident_categories WHERE is_active = 1 ORDER BY name ASC')
    .all();
  res.json({ categories });
});

publicRouter.get('/guidance', (_req, res) => {
  const rows = db
    .prepare(
      "SELECT key, value FROM campus_settings WHERE key IN ('campus_name', 'campus_center_lat', 'campus_center_lng', 'emergency_procedures', 'allow_student_sos_cancel')"
    )
    .all() as Array<{ key: string; value: string }>;

  const settings: Record<string, unknown> = {};
  for (const r of rows) {
    if (r.key === 'emergency_procedures') {
      try {
        settings[r.key] = JSON.parse(r.value);
      } catch {
        settings[r.key] = [];
      }
    } else {
      settings[r.key] = r.value;
    }
  }
  res.json({ guidance: settings });
});

publicRouter.get('/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  const items = db
    .prepare(
      `SELECT id, incident_id, notification_type, title, message, delivery_status, provider_reference, read_at, created_at, delivered_at
       FROM notifications
       WHERE recipient_id = ?
       ORDER BY created_at DESC
       LIMIT 50`
    )
    .all(req.user!.id);
  res.json({ notifications: items });
});

publicRouter.patch('/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  const now = new Date().toISOString();
  const result = db
    .prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND recipient_id = ?')
    .run(now, req.params.id, req.user!.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Notification not found.' });
    return;
  }
  res.json({ ok: true });
});

publicRouter.post('/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
  const now = new Date().toISOString();
  db.prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE recipient_id = ?').run(
    now,
    req.user!.id
  );
  res.json({ ok: true });
});
