import crypto from 'node:crypto';
import express from 'express';
import {
  cleanText,
  hashPassword,
  isStrongPassword,
  isValidEmail,
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
  type UserRole,
} from '../auth.ts';
import { db, writeAuditLog } from '../db.ts';
import { broadcastIncidentEvent, sendUserNotification } from '../realtime.ts';

export const adminRouter = express.Router();

adminRouter.use(requireAuth, requireRole('admin'));

// Users & Responders Management
adminRouter.get('/users', (req, res) => {
  const roleFilter = cleanText(req.query.role, 32);
  const query = roleFilter && roleFilter !== 'all'
    ? db.prepare(
        `SELECT id, full_name, email, phone, department, role, responder_specialty, account_status, email_verified, is_test_account, created_at, updated_at
         FROM profiles WHERE role = ? ORDER BY created_at DESC`
      ).all(roleFilter)
    : db.prepare(
        `SELECT id, full_name, email, phone, department, role, responder_specialty, account_status, email_verified, is_test_account, created_at, updated_at
         FROM profiles ORDER BY created_at DESC`
      ).all();

  res.json({ users: query });
});

adminRouter.post('/users', (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const fullName = cleanText(req.body?.fullName, 120);
  const email = cleanText(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const phone = cleanText(req.body?.phone, 32);
  const department = cleanText(req.body?.department, 120);
  const role = cleanText(req.body?.role, 32) as UserRole;
  const responderSpecialty = cleanText(req.body?.responderSpecialty, 120) || 'Campus Security';

  if (!fullName || !isValidEmail(email) || !isStrongPassword(password)) {
    res.status(400).json({ error: 'Valid full name, email, and password (minimum 8 chars) are required.' });
    return;
  }
  if (!['student', 'faculty', 'responder', 'admin'].includes(role)) {
    res.status(400).json({ error: 'Invalid user role specified.' });
    return;
  }

  const existing = db.prepare('SELECT id FROM profiles WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO profiles (id, full_name, email, password_hash, phone, department, role, responder_specialty, account_status, email_verified, verification_token, is_test_account, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, NULL, 0, ?, ?)`
  ).run(
    id,
    fullName,
    email,
    hashPassword(password),
    phone,
    department || (role === 'responder' ? responderSpecialty : 'Campus Administration'),
    role,
    role === 'responder' ? responderSpecialty : '',
    now,
    now
  );

  writeAuditLog(admin.id, 'ADMIN_USER_CREATED', 'profile', id, { role, email });
  const created = db
    .prepare(
      'SELECT id, full_name, email, phone, department, role, responder_specialty, account_status, email_verified, is_test_account, created_at FROM profiles WHERE id = ?'
    )
    .get(id);
  res.status(201).json({ user: created });
});

adminRouter.patch('/users/:id', (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const targetId = req.params.id;
  const target = db.prepare('SELECT id, role, account_status FROM profiles WHERE id = ?').get(targetId) as
    | { id: string; role: UserRole; account_status: string }
    | undefined;

  if (!target) {
    res.status(404).json({ error: 'User account not found.' });
    return;
  }

  const nextRole = cleanText(req.body?.role, 32) as UserRole | '';
  const nextStatus = cleanText(req.body?.accountStatus, 32);
  const nextSpecialty = cleanText(req.body?.responderSpecialty, 120);
  const nextDepartment = cleanText(req.body?.department, 120);

  if (nextRole && !['student', 'faculty', 'responder', 'admin'].includes(nextRole)) {
    res.status(400).json({ error: 'Invalid role.' });
    return;
  }
  if (nextStatus && !['active', 'inactive'].includes(nextStatus)) {
    res.status(400).json({ error: 'Invalid account status.' });
    return;
  }

  // Prevent removing/deactivating the last active administrator
  if (target.role === 'admin' && ((nextRole && nextRole !== 'admin') || nextStatus === 'inactive')) {
    const activeAdmins = db
      .prepare("SELECT COUNT(*) AS count FROM profiles WHERE role = 'admin' AND account_status = 'active'")
      .get() as { count: number };
    if (activeAdmins.count <= 1) {
      res.status(400).json({ error: 'Cannot remove or deactivate the last active administrator.' });
      return;
    }
  }

  if (targetId === admin.id && nextStatus === 'inactive') {
    res.status(400).json({ error: 'You cannot deactivate your own active administrator session.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE profiles
     SET role = COALESCE(NULLIF(?, ''), role),
         account_status = COALESCE(NULLIF(?, ''), account_status),
         responder_specialty = CASE WHEN ? != '' THEN ? ELSE responder_specialty END,
         department = CASE WHEN ? != '' THEN ? ELSE department END,
         updated_at = ?
     WHERE id = ?`
  ).run(nextRole, nextStatus, nextSpecialty, nextSpecialty, nextDepartment, nextDepartment, now, targetId);

  writeAuditLog(admin.id, 'ADMIN_USER_UPDATED', 'profile', targetId, {
    role: nextRole || target.role,
    account_status: nextStatus || target.account_status,
  });

  const updated = db
    .prepare(
      'SELECT id, full_name, email, phone, department, role, responder_specialty, account_status, email_verified, is_test_account, created_at FROM profiles WHERE id = ?'
    )
    .get(targetId);
  res.json({ user: updated });
});

// Responder list for assignment
adminRouter.get('/responders', (_req, res) => {
  const responders = db
    .prepare(
      `SELECT p.id, p.full_name, p.email, p.phone, p.department, p.responder_specialty, p.account_status, p.is_test_account,
              (SELECT COUNT(*) FROM incident_assignments ia
               JOIN incidents i ON i.id = ia.incident_id
               WHERE ia.responder_id = p.id AND ia.assignment_status IN ('pending', 'accepted')
                 AND i.status NOT IN ('Resolved', 'Closed', 'Cancelled')) AS active_workload
       FROM profiles p
       WHERE p.role = 'responder'
       ORDER BY p.account_status ASC, active_workload ASC, p.full_name ASC`
    )
    .all();
  res.json({ responders });
});

// Assign or reassign responder
adminRouter.post('/incidents/:id/assign', (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const responderId = cleanText(req.body?.responderId, 64);
  const note = cleanText(req.body?.note, 400);

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

  const responder = db
    .prepare("SELECT id, full_name, role, account_status FROM profiles WHERE id = ? AND role = 'responder' AND account_status = 'active'")
    .get(responderId) as { id: string; full_name: string } | undefined;

  if (!responder) {
    res.status(400).json({ error: 'Selected responder is invalid or inactive.' });
    return;
  }

  const now = new Date().toISOString();
  const nextStatus = ['Submitted', 'Acknowledged', 'Escalated'].includes(incident.status)
    ? 'Assigned'
    : incident.status;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO incident_assignments (id, incident_id, responder_id, assigned_by, assignment_status, decline_reason, assigned_at, acknowledged_at)
       VALUES (?, ?, ?, ?, 'pending', '', ?, NULL)`
    ).run(crypto.randomUUID(), incident.id, responder.id, admin.id, now);

    db.prepare('UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?').run(nextStatus, now, incident.id);

    db.prepare(
      `INSERT INTO incident_updates (id, incident_id, updated_by, previous_status, new_status, action_description, internal_note, visibility, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'public', ?)`
    ).run(
      crypto.randomUUID(),
      incident.id,
      admin.id,
      incident.status,
      nextStatus,
      `Assigned to Campus Responder ${responder.full_name}.`,
      note,
      now
    );

    const notifIdResp = crypto.randomUUID();
    db.prepare(
      `INSERT INTO notifications (id, incident_id, recipient_id, notification_type, title, message, delivery_status, provider_reference, created_at, delivered_at)
       VALUES (?, ?, ?, 'in_app', ?, ?, 'delivered', 'ws-assignment', ?, ?)`
    ).run(
      notifIdResp,
      incident.id,
      responder.id,
      `Assigned: ${incident.incident_number}`,
      `You have been assigned to ${incident.category} (${incident.priority} priority).`,
      now,
      now
    );

    const notifIdRep = crypto.randomUUID();
    db.prepare(
      `INSERT INTO notifications (id, incident_id, recipient_id, notification_type, title, message, delivery_status, provider_reference, created_at, delivered_at)
       VALUES (?, ?, ?, 'in_app', ?, ?, 'delivered', 'ws-assignment', ?, ?)`
    ).run(
      notifIdRep,
      incident.id,
      incident.reporter_id,
      `Responder Assigned: ${incident.incident_number}`,
      `${responder.full_name} has been assigned to your report.`,
      now,
      now
    );
  })();

  sendUserNotification(responder.id, {
    incident_id: incident.id,
    incident_number: incident.incident_number,
    title: `Assigned: ${incident.incident_number}`,
    message: `You have been assigned to ${incident.category} (${incident.priority} priority).`,
    created_at: now,
  });
  sendUserNotification(incident.reporter_id, {
    incident_id: incident.id,
    incident_number: incident.incident_number,
    title: `Responder Assigned: ${incident.incident_number}`,
    message: `${responder.full_name} has been assigned to your report.`,
    created_at: now,
  });

  writeAuditLog(admin.id, 'RESPONDER_ASSIGNED', 'incident', incident.id, {
    responder_id: responder.id,
    responder_name: responder.full_name,
  });

  broadcastIncidentEvent('incident:updated', {
    incidentId: incident.id,
    incidentNumber: incident.incident_number,
    status: nextStatus,
    reporterId: incident.reporter_id,
    assignedResponderIds: [responder.id],
  });

  res.json({ ok: true, status: nextStatus, responderName: responder.full_name });
});

// Analytics & Reports (real vs test separation)
adminRouter.get('/analytics', (req, res) => {
  const scope = req.query.scope === 'all' ? 'all' : req.query.scope === 'test' ? 'test' : 'real';
  const whereClause =
    scope === 'real'
      ? 'WHERE is_test_data = 0'
      : scope === 'test'
      ? 'WHERE is_test_data = 1'
      : '';

  const counts = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status NOT IN ('Resolved', 'Closed', 'Cancelled') THEN 1 ELSE 0 END) AS open_count,
         SUM(CASE WHEN priority = 'critical' AND status NOT IN ('Resolved', 'Closed', 'Cancelled') THEN 1 ELSE 0 END) AS critical_open,
         SUM(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) AS resolved_count,
         SUM(CASE WHEN status IN ('Submitted', 'Escalated') AND NOT EXISTS (
           SELECT 1 FROM incident_assignments ia WHERE ia.incident_id = incidents.id AND ia.assignment_status IN ('pending', 'accepted')
         ) THEN 1 ELSE 0 END) AS unassigned_count,
         SUM(CASE WHEN is_test_data = 1 THEN 1 ELSE 0 END) AS test_records,
         SUM(CASE WHEN is_test_data = 0 THEN 1 ELSE 0 END) AS real_records
       FROM incidents ${whereClause}`
    )
    .get();

  const byCategory = db
    .prepare(
      `SELECT category, COUNT(*) AS count
       FROM incidents ${whereClause}
       GROUP BY category
       ORDER BY count DESC`
    )
    .all();

  const byStatus = db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM incidents ${whereClause}
       GROUP BY status`
    )
    .all();

  const trends = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count,
              SUM(CASE WHEN is_sos = 1 THEN 1 ELSE 0 END) AS sos_count
       FROM incidents ${whereClause}
       GROUP BY substr(created_at, 1, 10)
       ORDER BY day ASC
       LIMIT 30`
    )
    .all();

  // Compute genuine average acknowledgement & resolution times from database records
  const ackRows = db
    .prepare(
      `SELECT i.created_at, MIN(iu.created_at) AS ack_at
       FROM incidents i
       JOIN incident_updates iu ON iu.incident_id = i.id
       ${whereClause ? whereClause + ' AND' : 'WHERE'} iu.new_status IN ('Acknowledged', 'Assigned', 'In Progress')
       GROUP BY i.id`
    )
    .all() as Array<{ created_at: string; ack_at: string }>;

  let avgAckMinutes: number | null = null;
  if (ackRows.length > 0) {
    const sumMin = ackRows.reduce((acc, r) => {
      const diff = (new Date(r.ack_at).getTime() - new Date(r.created_at).getTime()) / 60000;
      return acc + Math.max(0, diff);
    }, 0);
    avgAckMinutes = Number((sumMin / ackRows.length).toFixed(1));
  }

  const resRows = db
    .prepare(
      `SELECT created_at, resolved_at
       FROM incidents
       ${whereClause ? whereClause + ' AND' : 'WHERE'} resolved_at IS NOT NULL`
    )
    .all() as Array<{ created_at: string; resolved_at: string }>;

  let avgResolutionMinutes: number | null = null;
  if (resRows.length > 0) {
    const sumMin = resRows.reduce((acc, r) => {
      const diff = (new Date(r.resolved_at).getTime() - new Date(r.created_at).getTime()) / 60000;
      return acc + Math.max(0, diff);
    }, 0);
    avgResolutionMinutes = Number((sumMin / resRows.length).toFixed(1));
  }

  const workload = db
    .prepare(
      `SELECT p.id, p.full_name, p.responder_specialty,
              COUNT(CASE WHEN ia.assignment_status IN ('pending', 'accepted') AND i.status NOT IN ('Resolved', 'Closed', 'Cancelled') THEN 1 END) AS active_count,
              COUNT(CASE WHEN ia.assignment_status = 'completed' OR i.status IN ('Resolved', 'Closed') THEN 1 END) AS completed_count
       FROM profiles p
       LEFT JOIN incident_assignments ia ON ia.responder_id = p.id
       LEFT JOIN incidents i ON i.id = ia.incident_id
       WHERE p.role = 'responder'
       GROUP BY p.id
       ORDER BY active_count DESC, p.full_name ASC`
    )
    .all();

  res.json({
    scope,
    summary: counts,
    byCategory,
    byStatus,
    trends,
    avgAckMinutes,
    avgResolutionMinutes,
    workload,
  });
});

// Audit Logs
adminRouter.get('/audit-logs', (req, res) => {
  const limit = Math.min(200, Math.max(10, Number(req.query.limit) || 100));
  const logs = db
    .prepare(
      `SELECT a.*, p.full_name AS actor_name, p.email AS actor_email, p.role AS actor_role
       FROM audit_logs a
       LEFT JOIN profiles p ON p.id = a.actor_id
       ORDER BY a.timestamp DESC
       LIMIT ?`
    )
    .all(limit);
  res.json({ logs });
});

// Categories & Contacts & Settings Management
adminRouter.post('/categories', (req: AuthenticatedRequest, res) => {
  const name = cleanText(req.body?.name, 100);
  const defaultPriority = cleanText(req.body?.defaultPriority, 20);
  const responderDepartment = cleanText(req.body?.responderDepartment, 120);
  const description = cleanText(req.body?.description, 300);

  if (!name || !['critical', 'high', 'medium', 'low'].includes(defaultPriority) || !responderDepartment) {
    res.status(400).json({ error: 'Category name, valid default priority, and responder department are required.' });
    return;
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO incident_categories (id, name, default_priority, responder_department, description, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`
  ).run(id, name, defaultPriority, responderDepartment, description);

  writeAuditLog(req.user!.id, 'CATEGORY_CREATED', 'incident_category', id, { name });
  res.status(201).json({ id });
});

adminRouter.post('/emergency-contacts', (req: AuthenticatedRequest, res) => {
  const name = cleanText(req.body?.name, 120);
  const department = cleanText(req.body?.department, 120);
  const phone = cleanText(req.body?.phone, 40);
  const email = cleanText(req.body?.email, 254);
  const availability = cleanText(req.body?.availability, 120) || '24/7';
  const category = cleanText(req.body?.category, 60) || 'Security';

  if (!name || !department || !phone) {
    res.status(400).json({ error: 'Contact name, department, and phone number are required.' });
    return;
  }

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO emergency_contacts (id, name, department, phone, email, availability, category, priority_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, 10, 1)`
  ).run(id, name, department, phone, email, availability, category);

  writeAuditLog(req.user!.id, 'CONTACT_CREATED', 'emergency_contact', id, { name });
  res.status(201).json({ id });
});

adminRouter.delete('/emergency-contacts/:id', (req: AuthenticatedRequest, res) => {
  const result = db.prepare('DELETE FROM emergency_contacts WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Contact not found.' });
    return;
  }
  writeAuditLog(req.user!.id, 'CONTACT_DELETED', 'emergency_contact', req.params.id, {});
  res.json({ ok: true });
});

adminRouter.get('/settings', (_req, res) => {
  const rows = db.prepare('SELECT key, value, updated_at FROM campus_settings').all() as Array<{
    key: string;
    value: string;
    updated_at: string;
  }>;
  const map: Record<string, string> = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  res.json({
    settings: map,
    smtpConfigured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER),
  });
});

adminRouter.put('/settings', (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const updates = req.body?.settings as Record<string, unknown> | undefined;
  if (!updates || typeof updates !== 'object') {
    res.status(400).json({ error: 'Invalid settings payload.' });
    return;
  }

  const allowedKeys = [
    'campus_name',
    'campus_center_lat',
    'campus_center_lng',
    'escalation_threshold_minutes',
    'email_notifications_enabled',
    'web_push_enabled',
    'allow_student_sos_cancel',
    'emergency_procedures',
  ];

  const now = new Date().toISOString();
  const upsert = db.prepare(
    `INSERT INTO campus_settings (key, value, updated_by, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  );

  db.transaction(() => {
    for (const key of allowedKeys) {
      if (key in updates) {
        const raw = updates[key];
        const serialized = typeof raw === 'string' ? raw : JSON.stringify(raw);
        upsert.run(key, serialized, admin.id, now);
      }
    }
  })();

  writeAuditLog(admin.id, 'SETTINGS_UPDATED', 'campus_settings', 'global', {
    keys: Object.keys(updates).filter((k) => allowedKeys.includes(k)),
  });

  res.json({ ok: true });
});

// Academic Demo Test Data Loader (Admin-initiated, uses Admin-chosen password, strictly marked is_test_data=1)
adminRouter.post('/seed-demo', (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  const testPassword = typeof req.body?.testPassword === 'string' ? req.body.testPassword : '';
  if (!isStrongPassword(testPassword)) {
    res.status(400).json({
      error: 'Please enter a password (minimum 8 characters) to assign to the newly created demo test accounts.',
    });
    return;
  }

  const existingDemo = db.prepare('SELECT COUNT(*) AS count FROM incidents WHERE is_test_data = 1').get() as {
    count: number;
  };
  if (existingDemo.count > 0) {
    res.status(409).json({ error: 'Academic test dataset is already loaded. Clear it first if you wish to reload.' });
    return;
  }

  const nowMs = Date.now();
  const pwHash = hashPassword(testPassword);

  const studentId = crypto.randomUUID();
  const facultyId = crypto.randomUUID();
  const secRespId = crypto.randomUUID();
  const medRespId = crypto.randomUUID();

  const ensureAccount = db.prepare(
    `INSERT OR IGNORE INTO profiles (id, full_name, email, password_hash, phone, department, role, responder_specialty, account_status, email_verified, verification_token, is_test_account, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, NULL, 1, ?, ?)`
  );

  const createdIso = new Date(nowMs - 3600 * 1000).toISOString();

  db.transaction(() => {
    ensureAccount.run(studentId, 'Maya Patel (Test Student)', 'student.demo@campus.edu', pwHash, '+1 555-0141', 'Computer Science', 'student', '', createdIso, createdIso);
    ensureAccount.run(facultyId, 'Dr. Alan Rivera (Test Faculty)', 'faculty.demo@campus.edu', pwHash, '+1 555-0142', 'Mechanical Engineering', 'faculty', '', createdIso, createdIso);
    ensureAccount.run(secRespId, 'Officer Jordan Kim (Test Responder)', 'security.demo@campus.edu', pwHash, '+1 555-0143', 'Campus Security', 'responder', 'Campus Security', createdIso, createdIso);
    ensureAccount.run(medRespId, 'Paramedic Elena Vance (Test Medical)', 'medical.demo@campus.edu', pwHash, '+1 555-0144', 'Medical Services', 'responder', 'Medical & Health Services', createdIso, createdIso);

    const actualStudent = (db.prepare("SELECT id FROM profiles WHERE email = 'student.demo@campus.edu'").get() as { id: string }).id;
    const actualFaculty = (db.prepare("SELECT id FROM profiles WHERE email = 'faculty.demo@campus.edu'").get() as { id: string }).id;
    const actualSecResp = (db.prepare("SELECT id FROM profiles WHERE email = 'security.demo@campus.edu'").get() as { id: string }).id;
    const actualMedResp = (db.prepare("SELECT id FROM profiles WHERE email = 'medical.demo@campus.edu'").get() as { id: string }).id;

    const samples = [
      {
        num: 'SOS-TEST-0001',
        reporter: actualStudent,
        isSos: 1,
        cat: 'Medical emergency',
        title: '[TEST] Student fainted near Science Library entrance',
        desc: '[Sample Test Record] Sudden dizziness and collapse near the north ramp of Science Library.',
        priority: 'critical',
        status: 'In Progress',
        lat: 37.4282,
        lng: -122.1704,
        locDesc: 'Science Library North Entrance Ramp',
        offsetMin: 18,
        responder: actualMedResp,
        ackOffsetMin: 16,
      },
      {
        num: 'INC-TEST-0002',
        reporter: actualFaculty,
        isSos: 0,
        cat: 'Infrastructure hazard',
        title: '[TEST] Unlit stairwell & loose handrail in Engineering Block B',
        desc: '[Sample Test Record] Second-floor east stairwell lighting circuit failed and handrail anchor is loose.',
        priority: 'medium',
        status: 'Assigned',
        lat: 37.4268,
        lng: -122.1681,
        locDesc: 'Engineering Block B, East Stairwell Level 2',
        offsetMin: 95,
        responder: actualSecResp,
        ackOffsetMin: 80,
      },
      {
        num: 'INC-TEST-0003',
        reporter: actualStudent,
        isSos: 0,
        cat: 'Suspicious activity',
        title: '[TEST] Unattended backpack outside Student Union Hall',
        desc: '[Sample Test Record] Dark canvas backpack left unattended near east bicycle rack for 40+ minutes.',
        priority: 'medium',
        status: 'Resolved',
        lat: 37.4271,
        lng: -122.1712,
        locDesc: 'Student Union East Bicycle Plaza',
        offsetMin: 260,
        responder: actualSecResp,
        ackOffsetMin: 254,
        resolvedOffsetMin: 225,
      },
      {
        num: 'SOS-TEST-0004',
        reporter: actualStudent,
        isSos: 1,
        cat: 'Physical safety threat',
        title: '[TEST] Urgent escort requested near South Parking Deck',
        desc: '[Sample Test Record] Individual following reporter near Level 1 pedestrian exit.',
        priority: 'critical',
        status: 'Submitted',
        lat: 37.4259,
        lng: -122.1695,
        locDesc: 'South Parking Deck Pedestrian Exit',
        offsetMin: 2,
        responder: null,
        ackOffsetMin: null,
      },
    ];

    for (const s of samples) {
      const incId = crypto.randomUUID();
      const tCreated = new Date(nowMs - s.offsetMin * 60000).toISOString();
      const tResolved = s.resolvedOffsetMin ? new Date(nowMs - s.resolvedOffsetMin * 60000).toISOString() : null;

      db.prepare(
        `INSERT INTO incidents (id, incident_number, reporter_id, is_sos, category, title, description, affected_individuals, reporter_contact, priority, status, incident_time, idempotency_key, is_test_data, created_at, updated_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?, 1, ?, ?, ?)`
      ).run(incId, s.num, s.reporter, s.isSos, s.cat, s.title, s.desc, s.priority, s.status, tCreated, `demo-${s.num}`, tCreated, tResolved || tCreated, tResolved);

      db.prepare(
        `INSERT INTO incident_locations (id, incident_id, latitude, longitude, accuracy_meters, location_description, consent_given, consent_time, captured_at)
         VALUES (?, ?, ?, ?, 12, ?, 1, ?, ?)`
      ).run(crypto.randomUUID(), incId, s.lat, s.lng, s.locDesc, tCreated, tCreated);

      db.prepare(
        `INSERT INTO incident_updates (id, incident_id, updated_by, previous_status, new_status, action_description, internal_note, visibility, created_at)
         VALUES (?, ?, ?, NULL, 'Submitted', 'Test record submitted for academic demonstration.', '', 'public', ?)`
      ).run(crypto.randomUUID(), incId, s.reporter, tCreated);

      if (s.responder && s.ackOffsetMin) {
        const tAck = new Date(nowMs - s.ackOffsetMin * 60000).toISOString();
        db.prepare(
          `INSERT INTO incident_assignments (id, incident_id, responder_id, assigned_by, assignment_status, decline_reason, assigned_at, acknowledged_at)
           VALUES (?, ?, ?, ?, ?, '', ?, ?)`
        ).run(
          crypto.randomUUID(),
          incId,
          s.responder,
          admin.id,
          s.status === 'Resolved' ? 'completed' : s.status === 'In Progress' ? 'accepted' : 'pending',
          tAck,
          tAck
        );

        db.prepare(
          `INSERT INTO incident_updates (id, incident_id, updated_by, previous_status, new_status, action_description, internal_note, visibility, created_at)
           VALUES (?, ?, ?, 'Submitted', ?, ?, 'Internal test log entry.', 'public', ?)`
        ).run(crypto.randomUUID(), incId, s.responder, s.status, `Responder status updated to ${s.status}.`, tResolved || tAck);
      }
    }
  })();

  writeAuditLog(admin.id, 'DEMO_DATASET_LOADED', 'system', 'demo-seed', { count: 4 });
  res.status(201).json({
    ok: true,
    accounts: [
      { email: 'student.demo@campus.edu', role: 'student' },
      { email: 'faculty.demo@campus.edu', role: 'faculty' },
      { email: 'security.demo@campus.edu', role: 'responder' },
      { email: 'medical.demo@campus.edu', role: 'responder' },
    ],
  });
});

adminRouter.delete('/seed-demo', (req: AuthenticatedRequest, res) => {
  const admin = req.user!;
  db.transaction(() => {
    db.prepare('DELETE FROM incidents WHERE is_test_data = 1').run();
    db.prepare('DELETE FROM profiles WHERE is_test_account = 1').run();
  })();
  writeAuditLog(admin.id, 'DEMO_DATASET_CLEARED', 'system', 'demo-seed', {});
  res.json({ ok: true });
});
