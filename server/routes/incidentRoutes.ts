import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { cleanText, requireAuth, requireRole, type AuthenticatedRequest } from '../auth.ts';
import { db, generateIncidentNumber, UPLOADS_BASE_DIR, writeAuditLog } from '../db.ts';
import { broadcastIncidentEvent, sendUserNotification } from '../realtime.ts';

export const incidentRouter = express.Router();

const ALLOWED_STATUSES = [
  'Submitted',
  'Acknowledged',
  'Assigned',
  'In Progress',
  'Resolved',
  'Closed',
  'Cancelled',
  'Escalated',
] as const;

const ALLOWED_MIME_MAP: Record<string, { ext: string; magic: number[] }> = {
  'image/jpeg': { ext: '.jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: '.png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/webp': { ext: '.webp', magic: [0x52, 0x49, 0x46, 0x46] },
  'application/pdf': { ext: '.pdf', magic: [0x25, 0x50, 0x44, 0x46] },
};

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB

function validateCoordinate(val: unknown, min: number, max: number): number | null {
  if (typeof val !== 'number' || !Number.isFinite(val)) return null;
  if (val < min || val > max) return null;
  return Number(val.toFixed(6));
}

function canUserAccessIncident(user: NonNullable<AuthenticatedRequest['user']>, incident: { id: string; reporter_id: string; category: string; is_sos: number; priority: string }): boolean {
  if (user.role === 'admin') return true;
  if (user.role === 'student' || user.role === 'faculty') {
    return incident.reporter_id === user.id;
  }
  if (user.role === 'responder') {
    if (incident.is_sos === 1 || incident.priority === 'critical') return true;
    const assigned = db
      .prepare('SELECT id FROM incident_assignments WHERE incident_id = ? AND responder_id = ?')
      .get(incident.id, user.id);
    if (assigned) return true;
    if (!user.responder_specialty || user.responder_specialty === 'All Departments') return true;
    const cat = db
      .prepare('SELECT responder_department FROM incident_categories WHERE name = ?')
      .get(incident.category) as { responder_department: string } | undefined;
    if (!cat) return true;
    return cat.responder_department.toLowerCase().includes(user.responder_specialty.toLowerCase()) ||
      user.responder_specialty.toLowerCase().includes(cat.responder_department.toLowerCase());
  }
  return false;
}

function dispatchIncidentNotifications(
  incidentId: string,
  incidentNumber: string,
  category: string,
  priority: string,
  isSos: boolean,
  recipientIds: string[],
  title: string,
  publicSummary: string
): void {
  const now = new Date().toISOString();
  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
  const emailEnabledSetting = db
    .prepare("SELECT value FROM campus_settings WHERE key = 'email_notifications_enabled'")
    .get() as { value: string } | undefined;
  const shouldAttemptEmail = smtpConfigured && emailEnabledSetting?.value === 'true';

  const insertNotif = db.prepare(`
    INSERT INTO notifications (id, incident_id, recipient_id, notification_type, title, message, delivery_status, provider_reference, created_at, delivered_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const recipientId of recipientIds) {
    const inAppId = crypto.randomUUID();
    // Privacy: do not include sensitive medical description or precise GPS in notification body
    insertNotif.run(
      inAppId,
      incidentId,
      recipientId,
      'in_app',
      title,
      publicSummary,
      'delivered',
      'ws-realtime',
      now,
      now
    );

    sendUserNotification(recipientId, {
      id: inAppId,
      incident_id: incidentId,
      incident_number: incidentNumber,
      category,
      priority,
      is_sos: isSos,
      title,
      message: publicSummary,
      created_at: now,
    });

    // Record email notification status honestly (never claim delivered unless configured)
    insertNotif.run(
      crypto.randomUUID(),
      incidentId,
      recipientId,
      'email',
      title,
      publicSummary,
      shouldAttemptEmail ? 'pending' : 'unconfigured',
      shouldAttemptEmail ? 'smtp-queued' : 'smtp-not-configured',
      now,
      null
    );
  }
}

incidentRouter.post('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const isSos = Boolean(req.body?.isSos);
  const idempotencyKey = cleanText(req.body?.idempotencyKey, 100);

  // Duplicate prevention
  if (idempotencyKey) {
    const existing = db
      .prepare('SELECT id, incident_number, status, priority, created_at FROM incidents WHERE idempotency_key = ? AND reporter_id = ?')
      .get(idempotencyKey, user.id) as
      | { id: string; incident_number: string; status: string; priority: string; created_at: string }
      | undefined;
    if (existing) {
      res.status(200).json({ incident: existing, deduplicated: true });
      return;
    }
  }

  const category = cleanText(req.body?.category, 100) || (isSos ? 'Physical safety threat' : '');
  const title =
    cleanText(req.body?.title, 160) ||
    (isSos ? `SOS Emergency Alert: ${category}` : '');
  const description =
    cleanText(req.body?.description, 3000) ||
    (isSos ? 'Immediate emergency assistance requested via campus SOS button.' : '');
  const affectedIndividuals = cleanText(req.body?.affectedIndividuals, 500);
  const reporterContact = cleanText(req.body?.reporterContact, 120);
  const incidentTime = cleanText(req.body?.incidentTime, 64) || new Date().toISOString();

  const consentGiven = Boolean(req.body?.consentGiven);
  const locationDescription = cleanText(req.body?.locationDescription, 300);
  const lat = consentGiven ? validateCoordinate(req.body?.latitude, -90, 90) : null;
  const lng = consentGiven ? validateCoordinate(req.body?.longitude, -180, 180) : null;
  const accuracy =
    consentGiven && typeof req.body?.accuracyMeters === 'number' && Number.isFinite(req.body.accuracyMeters)
      ? Math.round(req.body.accuracyMeters)
      : null;
  const capturedAt = consentGiven && lat !== null && lng !== null ? new Date().toISOString() : null;
  const consentTime = consentGiven ? new Date().toISOString() : null;

  if (!category) {
    res.status(400).json({ error: 'Incident category is required.' });
    return;
  }
  if (!isSos && (!title || !description)) {
    res.status(400).json({ error: 'Incident title and description are required.' });
    return;
  }
  if (!locationDescription && (lat === null || lng === null)) {
    res.status(400).json({
      error: 'Please share your GPS location with consent or enter a manual campus location description.',
    });
    return;
  }

  // Validate optional attachment
  let validatedAttachment: {
    id: string;
    originalFilename: string;
    storagePath: string;
    mimeType: string;
    size: number;
    buffer: Buffer;
  } | null = null;

  if (req.body?.attachment) {
    const att = req.body.attachment as {
      filename?: unknown;
      mimeType?: unknown;
      dataBase64?: unknown;
    };
    const mimeType = cleanText(att.mimeType, 64).toLowerCase();
    const spec = ALLOWED_MIME_MAP[mimeType];
    if (!spec) {
      res.status(400).json({
        error: 'Unsupported attachment file type. Allowed types: JPEG, PNG, WEBP, and PDF.',
      });
      return;
    }
    if (typeof att.dataBase64 !== 'string' || !att.dataBase64) {
      res.status(400).json({ error: 'Invalid attachment payload.' });
      return;
    }
    const base64Clean = att.dataBase64.includes(',') ? att.dataBase64.split(',')[1] : att.dataBase64;
    const buffer = Buffer.from(base64Clean, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_ATTACHMENT_BYTES) {
      res.status(400).json({ error: 'Attachment must be between 1 byte and 5 MB.' });
      return;
    }
    const matchesMagic = spec.magic.every((byte, idx) => buffer[idx] === byte);
    if (!matchesMagic) {
      res.status(400).json({ error: 'Attachment file signature does not match declared MIME type.' });
      return;
    }

    const attId = crypto.randomUUID();
    const safeStorageName = `${attId}${spec.ext}`;
    const resolvedPath = path.resolve(UPLOADS_BASE_DIR, safeStorageName);
    if (!resolvedPath.startsWith(UPLOADS_BASE_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid attachment storage path.' });
      return;
    }
    validatedAttachment = {
      id: attId,
      originalFilename: cleanText(att.filename, 140) || `attachment${spec.ext}`,
      storagePath: safeStorageName,
      mimeType,
      size: buffer.length,
      buffer,
    };
  }

  // Determine priority strictly via server-side category/SOS rules (never trusting client priority override for SOS/students)
  const catRow = db
    .prepare('SELECT default_priority, responder_department FROM incident_categories WHERE name = ?')
    .get(category) as { default_priority: 'critical' | 'high' | 'medium' | 'low'; responder_department: string } | undefined;

  const assignedPriority: 'critical' | 'high' | 'medium' | 'low' = isSos
    ? 'critical'
    : catRow?.default_priority || 'medium';

  const incidentId = crypto.randomUUID();
  const incidentNumber = generateIncidentNumber(isSos);
  const now = new Date().toISOString();

  try {
    if (validatedAttachment) {
      const fullPath = path.resolve(UPLOADS_BASE_DIR, validatedAttachment.storagePath);
      fs.writeFileSync(fullPath, validatedAttachment.buffer);
    }

    db.transaction(() => {
      db.prepare(
        `INSERT INTO incidents (id, incident_number, reporter_id, is_sos, category, title, description, affected_individuals, reporter_contact, priority, status, incident_time, idempotency_key, is_test_data, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', ?, ?, 0, ?, ?)`
      ).run(
        incidentId,
        incidentNumber,
        user.id,
        isSos ? 1 : 0,
        category,
        title,
        description,
        affectedIndividuals,
        reporterContact,
        assignedPriority,
        incidentTime,
        idempotencyKey || null,
        now,
        now
      );

      db.prepare(
        `INSERT INTO incident_locations (id, incident_id, latitude, longitude, accuracy_meters, location_description, consent_given, consent_time, captured_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        incidentId,
        lat,
        lng,
        accuracy,
        locationDescription,
        consentGiven ? 1 : 0,
        consentTime,
        capturedAt
      );

      db.prepare(
        `INSERT INTO incident_updates (id, incident_id, updated_by, previous_status, new_status, action_description, internal_note, visibility, created_at)
         VALUES (?, ?, ?, NULL, 'Submitted', ?, '', 'public', ?)`
      ).run(
        crypto.randomUUID(),
        incidentId,
        user.id,
        isSos ? 'SOS emergency alert submitted. Awaiting responder acknowledgement.' : 'Incident report submitted. Awaiting responder review.',
        now
      );

      if (validatedAttachment) {
        db.prepare(
          `INSERT INTO incident_attachments (id, incident_id, uploaded_by, original_filename, storage_path, file_type, file_size, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          validatedAttachment.id,
          incidentId,
          user.id,
          validatedAttachment.originalFilename,
          validatedAttachment.storagePath,
          validatedAttachment.mimeType,
          validatedAttachment.size,
          now
        );
      }
    })();

    // Determine authorized responders to notify
    const staffRows = db
      .prepare(
        `SELECT id, role, responder_specialty FROM profiles
         WHERE role IN ('responder', 'admin') AND account_status = 'active'`
      )
      .all() as Array<{ id: string; role: string; responder_specialty: string }>;

    const targetDept = (catRow?.responder_department || '').toLowerCase();
    const recipientIds = staffRows
      .filter((s) => {
        if (s.role === 'admin' || isSos || assignedPriority === 'critical') return true;
        if (!s.responder_specialty || s.responder_specialty === 'All Departments' || !targetDept) return true;
        return (
          targetDept.includes(s.responder_specialty.toLowerCase()) ||
          s.responder_specialty.toLowerCase().includes(targetDept)
        );
      })
      .map((s) => s.id);

    dispatchIncidentNotifications(
      incidentId,
      incidentNumber,
      category,
      assignedPriority,
      isSos,
      recipientIds,
      isSos ? `SOS Alert ${incidentNumber}` : `New ${assignedPriority.toUpperCase()} Incident ${incidentNumber}`,
      `${category} reported (${assignedPriority} priority). Open Incident Center to review and acknowledge.`
    );

    writeAuditLog(user.id, isSos ? 'SOS_SUBMITTED' : 'INCIDENT_SUBMITTED', 'incident', incidentId, {
      incident_number: incidentNumber,
      category,
      priority: assignedPriority,
      consent_given: consentGiven,
    });

    broadcastIncidentEvent('incident:created', {
      incidentId,
      incidentNumber,
      status: 'Submitted',
      priority: assignedPriority,
      isSos,
      reporterId: user.id,
    });

    res.status(201).json({
      incident: {
        id: incidentId,
        incident_number: incidentNumber,
        status: 'Submitted',
        priority: assignedPriority,
        is_sos: isSos ? 1 : 0,
        category,
        title,
        created_at: now,
      },
    });
  } catch (err) {
    console.error('Submit incident error:', err);
    res.status(500).json({ error: 'Unable to submit report. Please try again or call Campus Security directly.' });
  }
});

incidentRouter.get('/', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const statusFilter = cleanText(req.query.status, 40);
  const priorityFilter = cleanText(req.query.priority, 20);
  const includeTest = req.query.includeTest === 'true';

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (user.role === 'student' || user.role === 'faculty') {
    conditions.push('i.reporter_id = ?');
    params.push(user.id);
  } else if (user.role === 'responder') {
    // Responders see assigned incidents, critical/SOS emergencies, or incidents matching their department
    const dept = user.responder_specialty && user.responder_specialty !== 'All Departments'
      ? user.responder_specialty
      : '';
    if (dept) {
      conditions.push(
        `(i.is_sos = 1 OR i.priority = 'critical' OR EXISTS (
          SELECT 1 FROM incident_assignments ia WHERE ia.incident_id = i.id AND ia.responder_id = ?
        ) OR EXISTS (
          SELECT 1 FROM incident_categories ic WHERE ic.name = i.category AND LOWER(ic.responder_department) LIKE ?
        ))`
      );
      params.push(user.id, `%${dept.toLowerCase()}%`);
    }
  }

  if (user.role === 'admin' && !includeTest) {
    // Keep real vs test data selectable on admin views, default all or filtered
  }
  if (req.query.onlyReal === 'true') {
    conditions.push('i.is_test_data = 0');
  }
  if (statusFilter && statusFilter !== 'all') {
    conditions.push('i.status = ?');
    params.push(statusFilter);
  }
  if (priorityFilter && priorityFilter !== 'all') {
    conditions.push('i.priority = ?');
    params.push(priorityFilter);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT
         i.id, i.incident_number, i.reporter_id, i.is_sos, i.category, i.title, i.description,
         i.priority, i.status, i.incident_time, i.is_test_data, i.created_at, i.updated_at, i.resolved_at, i.closed_at,
         p.full_name AS reporter_name, p.role AS reporter_role, p.department AS reporter_department,
         l.latitude, l.longitude, l.accuracy_meters, l.location_description, l.consent_given, l.captured_at,
         (
           SELECT ia.assignment_status FROM incident_assignments ia
           WHERE ia.incident_id = i.id ORDER BY ia.assigned_at DESC LIMIT 1
         ) AS latest_assignment_status,
         (
           SELECT resp.full_name FROM incident_assignments ia
           JOIN profiles resp ON resp.id = ia.responder_id
           WHERE ia.incident_id = i.id AND ia.assignment_status IN ('pending', 'accepted', 'completed')
           ORDER BY ia.assigned_at DESC LIMIT 1
         ) AS assigned_responder_name,
         (
           SELECT ia.responder_id FROM incident_assignments ia
           WHERE ia.incident_id = i.id AND ia.assignment_status IN ('pending', 'accepted', 'completed')
           ORDER BY ia.assigned_at DESC LIMIT 1
         ) AS assigned_responder_id
       FROM incidents i
       JOIN profiles p ON p.id = i.reporter_id
       LEFT JOIN incident_locations l ON l.incident_id = i.id
       ${whereClause}
       ORDER BY
         CASE i.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END ASC,
         i.created_at DESC
       LIMIT 200`
    )
    .all(...params);

  res.json({ incidents: rows });
});

incidentRouter.get('/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const incident = db
    .prepare(
      `SELECT
         i.*,
         p.full_name AS reporter_name, p.email AS reporter_email, p.phone AS reporter_phone, p.role AS reporter_role, p.department AS reporter_department
       FROM incidents i
       JOIN profiles p ON p.id = i.reporter_id
       WHERE i.id = ?`
    )
    .get(req.params.id) as
    | ({
        id: string;
        reporter_id: string;
        category: string;
        is_sos: number;
        priority: string;
      } & Record<string, unknown>)
    | undefined;

  if (!incident) {
    res.status(404).json({ error: 'Incident record not found.' });
    return;
  }

  if (!canUserAccessIncident(user, incident)) {
    writeAuditLog(user.id, 'UNAUTHORIZED_INCIDENT_ACCESS_ATTEMPT', 'incident', incident.id, {
      role: user.role,
    });
    res.status(403).json({ error: 'You are not authorized to view this incident record.' });
    return;
  }

  const location = db
    .prepare('SELECT * FROM incident_locations WHERE incident_id = ?')
    .get(incident.id);

  const assignments = db
    .prepare(
      `SELECT ia.*, resp.full_name AS responder_name, resp.responder_specialty, resp.phone AS responder_phone,
              assigner.full_name AS assigned_by_name
       FROM incident_assignments ia
       JOIN profiles resp ON resp.id = ia.responder_id
       JOIN profiles assigner ON assigner.id = ia.assigned_by
       WHERE ia.incident_id = ?
       ORDER BY ia.assigned_at DESC`
    )
    .all(incident.id);

  const isStaff = user.role === 'responder' || user.role === 'admin';
  const updatesRaw = db
    .prepare(
      `SELECT iu.id, iu.incident_id, iu.updated_by, iu.previous_status, iu.new_status,
              iu.action_description, iu.internal_note, iu.visibility, iu.created_at,
              u.full_name AS updated_by_name, u.role AS updated_by_role
       FROM incident_updates iu
       JOIN profiles u ON u.id = iu.updated_by
       WHERE iu.incident_id = ?
       ${isStaff ? '' : "AND iu.visibility = 'public'"}
       ORDER BY iu.created_at ASC`
    )
    .all(incident.id) as Array<Record<string, unknown>>;

  const updates = updatesRaw.map((u) => {
    if (!isStaff) {
      const { internal_note: _hidden, ...publicUpdate } = u;
      return publicUpdate;
    }
    return u;
  });

  const attachments = db
    .prepare(
      'SELECT id, original_filename, file_type, file_size, created_at FROM incident_attachments WHERE incident_id = ?'
    )
    .all(incident.id);

  res.json({
    incident,
    location,
    assignments,
    updates,
    attachments,
  });
});

incidentRouter.get('/:id/attachments/:attachmentId', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const incident = db
    .prepare('SELECT id, reporter_id, category, is_sos, priority FROM incidents WHERE id = ?')
    .get(req.params.id) as
    | { id: string; reporter_id: string; category: string; is_sos: number; priority: string }
    | undefined;

  if (!incident || !canUserAccessIncident(user, incident)) {
    res.status(403).json({ error: 'Unauthorized to access attachment.' });
    return;
  }

  const att = db
    .prepare('SELECT * FROM incident_attachments WHERE id = ? AND incident_id = ?')
    .get(req.params.attachmentId, incident.id) as
    | { original_filename: string; storage_path: string; file_type: string }
    | undefined;

  if (!att) {
    res.status(404).json({ error: 'Attachment not found.' });
    return;
  }

  const fullPath = path.resolve(UPLOADS_BASE_DIR, att.storage_path);
  if (!fullPath.startsWith(UPLOADS_BASE_DIR + path.sep) || !fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Attachment file missing.' });
    return;
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', att.file_type);
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${att.original_filename.replace(/["\r\n]/g, '_')}"`
  );
  res.sendFile(fullPath);
});

incidentRouter.post('/:id/cancel', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = req.user!;
  const reason = cleanText(req.body?.reason, 400) || 'Cancelled by reporter.';

  const incident = db
    .prepare('SELECT id, incident_number, reporter_id, is_sos, status FROM incidents WHERE id = ?')
    .get(req.params.id) as
    | { id: string; incident_number: string; reporter_id: string; is_sos: number; status: string }
    | undefined;

  if (!incident) {
    res.status(404).json({ error: 'Incident not found.' });
    return;
  }

  if (user.role !== 'admin' && incident.reporter_id !== user.id) {
    res.status(403).json({ error: 'Only the incident reporter or an administrator can cancel this alert.' });
    return;
  }

  if (user.role !== 'admin' && !['Submitted', 'Acknowledged'].includes(incident.status)) {
    res.status(400).json({
      error: `Cannot cancel an incident once its status is ${incident.status}. Contact Campus Security directly if assistance is no longer needed.`,
    });
    return;
  }

  if (user.role !== 'admin' && incident.is_sos === 1) {
    const setting = db
      .prepare("SELECT value FROM campus_settings WHERE key = 'allow_student_sos_cancel'")
      .get() as { value: string } | undefined;
    if (setting?.value === 'false') {
      res.status(403).json({ error: 'SOS alert cancellation is disabled by campus policy. Please wait for responder contact.' });
      return;
    }
  }

  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare("UPDATE incidents SET status = 'Cancelled', updated_at = ? WHERE id = ?").run(now, incident.id);
    db.prepare(
      `INSERT INTO incident_updates (id, incident_id, updated_by, previous_status, new_status, action_description, internal_note, visibility, created_at)
       VALUES (?, ?, ?, ?, 'Cancelled', ?, '', 'public', ?)`
    ).run(crypto.randomUUID(), incident.id, user.id, incident.status, reason, now);
  })();

  writeAuditLog(user.id, 'INCIDENT_CANCELLED', 'incident', incident.id, {
    previous_status: incident.status,
    reason,
  });

  broadcastIncidentEvent('incident:updated', {
    incidentId: incident.id,
    incidentNumber: incident.incident_number,
    status: 'Cancelled',
    reporterId: incident.reporter_id,
  });

  res.json({ ok: true, status: 'Cancelled' });
});

incidentRouter.post(
  '/:id/acknowledge',
  requireAuth,
  requireRole('responder', 'admin'),
  (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const note = cleanText(req.body?.note, 500) || 'Alert acknowledged by authorized campus safety personnel.';

    const incident = db
      .prepare('SELECT id, incident_number, reporter_id, status, category, priority, is_sos FROM incidents WHERE id = ?')
      .get(req.params.id) as
      | {
          id: string;
          incident_number: string;
          reporter_id: string;
          status: string;
          category: string;
          priority: string;
          is_sos: number;
        }
      | undefined;

    if (!incident) {
      res.status(404).json({ error: 'Incident not found.' });
      return;
    }

    if (!['Submitted', 'Escalated'].includes(incident.status)) {
      res.status(400).json({ error: `Incident is already in ${incident.status} status.` });
      return;
    }

    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("UPDATE incidents SET status = 'Acknowledged', updated_at = ? WHERE id = ?").run(now, incident.id);
      db.prepare(
        `UPDATE incident_assignments SET acknowledged_at = COALESCE(acknowledged_at, ?)
         WHERE incident_id = ? AND responder_id = ?`
      ).run(now, incident.id, user.id);

      db.prepare(
        `INSERT INTO incident_updates (id, incident_id, updated_by, previous_status, new_status, action_description, internal_note, visibility, created_at)
         VALUES (?, ?, ?, ?, 'Acknowledged', ?, '', 'public', ?)`
      ).run(crypto.randomUUID(), incident.id, user.id, incident.status, note, now);
    })();

    dispatchIncidentNotifications(
      incident.id,
      incident.incident_number,
      incident.category,
      incident.priority,
      incident.is_sos === 1,
      [incident.reporter_id],
      `Incident ${incident.incident_number} Acknowledged`,
      `${user.full_name} (${user.role === 'admin' ? 'Dispatch Coordinator' : 'Campus Responder'}) acknowledged your report.`
    );

    writeAuditLog(user.id, 'INCIDENT_ACKNOWLEDGED', 'incident', incident.id, {
      previous_status: incident.status,
    });

    broadcastIncidentEvent('incident:updated', {
      incidentId: incident.id,
      incidentNumber: incident.incident_number,
      status: 'Acknowledged',
      reporterId: incident.reporter_id,
    });

    res.json({ ok: true, status: 'Acknowledged' });
  }
);

incidentRouter.post(
  '/:id/assignment-response',
  requireAuth,
  requireRole('responder', 'admin'),
  (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const decision = cleanText(req.body?.decision, 20).toLowerCase();
    const reason = cleanText(req.body?.reason, 500);

    if (decision !== 'accepted' && decision !== 'declined') {
      res.status(400).json({ error: 'Decision must be "accepted" or "declined".' });
      return;
    }
    if (decision === 'declined' && !reason) {
      res.status(400).json({ error: 'A reason is required when declining an assignment.' });
      return;
    }

    const incident = db
      .prepare('SELECT id, incident_number, reporter_id, status, category, priority, is_sos FROM incidents WHERE id = ?')
      .get(req.params.id) as
      | {
          id: string;
          incident_number: string;
          reporter_id: string;
          status: string;
          category: string;
          priority: string;
          is_sos: number;
        }
      | undefined;

    if (!incident) {
      res.status(404).json({ error: 'Incident not found.' });
      return;
    }

    const assignment = db
      .prepare(
        `SELECT id, assignment_status FROM incident_assignments
         WHERE incident_id = ? AND responder_id = ?
         ORDER BY assigned_at DESC LIMIT 1`
      )
      .get(incident.id, user.id) as { id: string; assignment_status: string } | undefined;

    const now = new Date().toISOString();

    if (decision === 'accepted') {
      db.transaction(() => {
        if (assignment) {
          db.prepare(
            `UPDATE incident_assignments
             SET assignment_status = 'accepted', acknowledged_at = COALESCE(acknowledged_at, ?)
             WHERE id = ?`
          ).run(now, assignment.id);
        } else {
          // Self-claim by responder if unassigned
          db.prepare(
            `INSERT INTO incident_assignments (id, incident_id, responder_id, assigned_by, assignment_status, decline_reason, assigned_at, acknowledged_at)
             VALUES (?, ?, ?, ?, 'accepted', '', ?, ?)`
          ).run(crypto.randomUUID(), incident.id, user.id, user.id, now, now);
        }

        db.prepare("UPDATE incidents SET status = 'In Progress', updated_at = ? WHERE id = ?").run(now, incident.id);
        db.prepare(
          `INSERT INTO incident_updates (id, incident_id, updated_by, previous_status, new_status, action_description, internal_note, visibility, created_at)
           VALUES (?, ?, ?, ?, 'In Progress', ?, '', 'public', ?)`
        ).run(
          crypto.randomUUID(),
          incident.id,
          user.id,
          incident.status,
          `Responder ${user.full_name} accepted assignment and is actively responding.`,
          now
        );
      })();

      dispatchIncidentNotifications(
        incident.id,
        incident.incident_number,
        incident.category,
        incident.priority,
        incident.is_sos === 1,
        [incident.reporter_id],
        `Responder En Route: ${incident.incident_number}`,
        `${user.full_name} has accepted your incident and response is now In Progress.`
      );

      writeAuditLog(user.id, 'ASSIGNMENT_ACCEPTED', 'incident', incident.id, {});
      broadcastIncidentEvent('incident:updated', {
        incidentId: incident.id,
        incidentNumber: incident.incident_number,
        status: 'In Progress',
        reporterId: incident.reporter_id,
      });
      res.json({ ok: true, status: 'In Progress' });
      return;
    }

    // Declined
    if (!assignment) {
      res.status(400).json({ error: 'No active assignment found for your account on this incident.' });
      return;
    }

    db.transaction(() => {
      db.prepare(
        "UPDATE incident_assignments SET assignment_status = 'declined', decline_reason = ? WHERE id = ?"
      ).run(reason, assignment.id);
      db.prepare(
        `INSERT INTO incident_updates (id, incident_id, updated_by, previous_status, new_status, action_description, internal_note, visibility, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'internal', ?)`
      ).run(
        crypto.randomUUID(),
        incident.id,
        user.id,
        incident.status,
        incident.status,
        `Responder ${user.full_name} declined assignment.`,
        `Decline reason: ${reason}`,
        now
      );
    })();

    const admins = db
      .prepare("SELECT id FROM profiles WHERE role = 'admin' AND account_status = 'active'")
      .all() as Array<{ id: string }>;
    dispatchIncidentNotifications(
      incident.id,
      incident.incident_number,
      incident.category,
      incident.priority,
      incident.is_sos === 1,
      admins.map((a) => a.id),
      `Reassignment Needed: ${incident.incident_number}`,
      `${user.full_name} declined assignment. Please assign another responder.`
    );

    writeAuditLog(user.id, 'ASSIGNMENT_DECLINED', 'incident', incident.id, { reason });
    broadcastIncidentEvent('incident:updated', {
      incidentId: incident.id,
      incidentNumber: incident.incident_number,
      status: incident.status,
      reporterId: incident.reporter_id,
    });

    res.json({ ok: true, assignmentStatus: 'declined' });
  }
);

incidentRouter.post(
  '/:id/status',
  requireAuth,
  requireRole('responder', 'admin'),
  (req: AuthenticatedRequest, res) => {
    const user = req.user!;
    const newStatus = cleanText(req.body?.status, 40) as (typeof ALLOWED_STATUSES)[number];
    const actionDescription = cleanText(req.body?.actionDescription, 1000);
    const internalNote = cleanText(req.body?.internalNote, 1500);
    const visibility = req.body?.visibility === 'internal' ? 'internal' : 'public';

    if (!ALLOWED_STATUSES.includes(newStatus)) {
      res.status(400).json({ error: 'Invalid status value.' });
      return;
    }
    if (!actionDescription) {
      res.status(400).json({ error: 'Please provide an action description for this status update.' });
      return;
    }

    const incident = db
      .prepare('SELECT id, incident_number, reporter_id, status, category, priority, is_sos FROM incidents WHERE id = ?')
      .get(req.params.id) as
      | {
          id: string;
          incident_number: string;
          reporter_id: string;
          status: string;
          category: string;
          priority: string;
          is_sos: number;
        }
      | undefined;

    if (!incident) {
      res.status(404).json({ error: 'Incident not found.' });
      return;
    }

    const now = new Date().toISOString();
    const resolvedAt = newStatus === 'Resolved' ? now : undefined;
    const closedAt = newStatus === 'Closed' ? now : undefined;

    db.transaction(() => {
      db.prepare(
        `UPDATE incidents
         SET status = ?,
             updated_at = ?,
             resolved_at = COALESCE(?, resolved_at),
             closed_at = COALESCE(?, closed_at)
         WHERE id = ?`
      ).run(newStatus, now, resolvedAt || null, closedAt || null, incident.id);

      if (newStatus === 'Resolved' || newStatus === 'Closed') {
        db.prepare(
          `UPDATE incident_assignments SET assignment_status = 'completed'
           WHERE incident_id = ? AND assignment_status = 'accepted'`
        ).run(incident.id);
      }

      db.prepare(
        `INSERT INTO incident_updates (id, incident_id, updated_by, previous_status, new_status, action_description, internal_note, visibility, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        incident.id,
        user.id,
        incident.status,
        newStatus,
        actionDescription,
        internalNote,
        visibility,
        now
      );
    })();

    if (visibility === 'public') {
      dispatchIncidentNotifications(
        incident.id,
        incident.incident_number,
        incident.category,
        incident.priority,
        incident.is_sos === 1,
        [incident.reporter_id],
        `Incident ${incident.incident_number}: ${newStatus}`,
        `Status updated from ${incident.status} to ${newStatus}. ${actionDescription}`
      );
    }

    writeAuditLog(user.id, 'INCIDENT_STATUS_UPDATED', 'incident', incident.id, {
      previous_status: incident.status,
      new_status: newStatus,
      visibility,
    });

    broadcastIncidentEvent('incident:updated', {
      incidentId: incident.id,
      incidentNumber: incident.incident_number,
      status: newStatus,
      reporterId: incident.reporter_id,
    });

    res.json({ ok: true, status: newStatus });
  }
);
