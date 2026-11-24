import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export const DB_PATH = path.join(DATA_DIR, 'campus_safety.db');
export const UPLOADS_BASE_DIR = UPLOAD_DIR;

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT DEFAULT '',
      department TEXT DEFAULT '',
      role TEXT NOT NULL CHECK (role IN ('student', 'faculty', 'responder', 'admin')),
      responder_specialty TEXT DEFAULT '',
      account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'inactive', 'pending_verification')),
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      is_test_account INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      incident_number TEXT NOT NULL UNIQUE,
      reporter_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      is_sos INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      affected_individuals TEXT DEFAULT '',
      reporter_contact TEXT DEFAULT '',
      priority TEXT NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
      status TEXT NOT NULL CHECK (status IN ('Submitted', 'Acknowledged', 'Assigned', 'In Progress', 'Resolved', 'Closed', 'Cancelled', 'Escalated')),
      incident_time TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      is_test_data INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS incident_locations (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL UNIQUE REFERENCES incidents(id) ON DELETE CASCADE,
      latitude REAL,
      longitude REAL,
      accuracy_meters REAL,
      location_description TEXT NOT NULL DEFAULT '',
      consent_given INTEGER NOT NULL DEFAULT 0,
      consent_time TEXT,
      captured_at TEXT
    );

    CREATE TABLE IF NOT EXISTS incident_assignments (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      responder_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      assigned_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      assignment_status TEXT NOT NULL CHECK (assignment_status IN ('pending', 'accepted', 'declined', 'completed')),
      decline_reason TEXT DEFAULT '',
      assigned_at TEXT NOT NULL,
      acknowledged_at TEXT
    );

    CREATE TABLE IF NOT EXISTS incident_updates (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      updated_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      previous_status TEXT,
      new_status TEXT NOT NULL,
      action_description TEXT NOT NULL,
      internal_note TEXT DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'internal')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      incident_id TEXT REFERENCES incidents(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      notification_type TEXT NOT NULL CHECK (notification_type IN ('in_app', 'email', 'web_push')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      delivery_status TEXT NOT NULL CHECK (delivery_status IN ('pending', 'delivered', 'failed', 'unconfigured')),
      provider_reference TEXT DEFAULT '',
      read_at TEXT,
      created_at TEXT NOT NULL,
      delivered_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT DEFAULT '',
      timestamp TEXT NOT NULL,
      metadata TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS incident_attachments (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      uploaded_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      original_filename TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emergency_contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      department TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT DEFAULT '',
      availability TEXT NOT NULL,
      category TEXT NOT NULL,
      priority_order INTEGER NOT NULL DEFAULT 10,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS incident_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      default_priority TEXT NOT NULL CHECK (default_priority IN ('critical', 'high', 'medium', 'low')),
      responder_department TEXT NOT NULL,
      description TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS campus_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents(priority);
    CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON incidents(reporter_id);
    CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at);
    CREATE INDEX IF NOT EXISTS idx_assignments_responder ON incident_assignments(responder_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_incident ON incident_assignments(incident_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
  `);

  seedReferenceData();
}

function seedReferenceData(): void {
  const now = new Date().toISOString();

  const categoryCount = db.prepare('SELECT COUNT(*) AS count FROM incident_categories').get() as { count: number };
  if (categoryCount.count === 0) {
    const categories = [
      ['Medical emergency', 'critical', 'Medical & Health Services', 'Acute injuries, unconsciousness, allergic reactions, or urgent medical distress'],
      ['Fire or smoke', 'critical', 'Fire & Life Safety', 'Active fire, smoke alarm activation, electrical burning, or hazardous chemical smoke'],
      ['Physical safety threat', 'critical', 'Campus Security', 'Immediate physical threat, assault, weapon sighting, or active danger'],
      ['Security incident', 'high', 'Campus Security', 'Unauthorized entry, theft in progress, vandalism, or perimeter breach'],
      ['Harassment or misconduct', 'high', 'Campus Security & Student Support', 'Stalking, verbal threats, bullying, or personal safety misconduct'],
      ['Missing person', 'high', 'Campus Security', 'Unaccounted student, faculty, or visitor requiring immediate welfare check'],
      ['Suspicious activity', 'medium', 'Campus Security', 'Unattended packages, loitering in restricted zones, or unusual behavior'],
      ['Infrastructure hazard', 'medium', 'Facilities & Maintenance', 'Broken lighting, exposed wiring, structural damage, or slippery walkways'],
      ['Other incident', 'low', 'General Safety Desk', 'Non-urgent safety observations or general campus assistance requests'],
    ] as const;

    const insertCat = db.prepare(`
      INSERT INTO incident_categories (id, name, default_priority, responder_department, description, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);
    const tx = db.transaction(() => {
      for (const [name, priority, dept, desc] of categories) {
        insertCat.run(crypto.randomUUID(), name, priority, dept, desc);
      }
    });
    tx();
  }

  const contactCount = db.prepare('SELECT COUNT(*) AS count FROM emergency_contacts').get() as { count: number };
  if (contactCount.count === 0) {
    const contacts = [
      ['Campus Security Control Room', 'Campus Security', '+1 (555) 010-9111', 'security-dispatch@campus.edu', '24/7 Emergency Line', 'Security', 1],
      ['Campus Health & Triage Clinic', 'Medical Services', '+1 (555) 010-2200', 'health-clinic@campus.edu', '24/7 On-Call Paramedic', 'Medical', 2],
      ['Fire & Hazardous Materials Desk', 'Fire & Life Safety', '+1 (555) 010-3300', 'fire-safety@campus.edu', '24/7 Rapid Response', 'Fire', 3],
      ['Counseling & Crisis Support', 'Student Affairs', '+1 (555) 010-4400', 'crisis-support@campus.edu', '24/7 Confidential Helpline', 'Support', 4],
      ['Facilities Emergency Repair', 'Facilities & Operations', '+1 (555) 010-5500', 'facilities@campus.edu', '06:00 - 22:00 / On-Call Night', 'Facilities', 5],
      ['Local Municipal Emergency (911)', 'External Emergency Services', '911', '', '24/7 Public Safety', 'External', 6],
    ] as const;

    const insertContact = db.prepare(`
      INSERT INTO emergency_contacts (id, name, department, phone, email, availability, category, priority_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const tx = db.transaction(() => {
      for (const [name, dept, phone, email, avail, cat, order] of contacts) {
        insertContact.run(crypto.randomUUID(), name, dept, phone, email, avail, cat, order);
      }
    });
    tx();
  }

  const settingsDefaults: Array<[string, string]> = [
    ['campus_name', 'Northbridge University Campus'],
    ['campus_center_lat', '37.4275'],
    ['campus_center_lng', '-122.1697'],
    ['escalation_threshold_minutes', '5'],
    ['email_notifications_enabled', 'false'],
    ['web_push_enabled', 'true'],
    ['allow_student_sos_cancel', 'true'],
    [
      'emergency_procedures',
      JSON.stringify([
        {
          id: 'proc-medical',
          title: 'Medical Emergency Protocol',
          steps: [
            'Stay calm and ensure the area around the person is safe before approaching.',
            'Submit an SOS Alert or call Campus Health & Triage immediately.',
            'Do not move an injured person unless they face immediate danger (fire, traffic, collapse).',
            'Meet Campus Responders at the nearest building entrance if safe to do so.',
          ],
        },
        {
          id: 'proc-fire',
          title: 'Fire, Smoke & Evacuation Protocol',
          steps: [
            'Activate the nearest manual fire alarm pull station and exit immediately.',
            'Use stairwells only — never use elevators during a fire or smoke event.',
            'Close doors behind you to slow smoke spread without locking them.',
            'Assemble at the designated Campus Quad Evacuation Point at least 150 feet from the building.',
          ],
        },
        {
          id: 'proc-threat',
          title: 'Active Safety Threat Protocol',
          steps: [
            'Evacuate the area immediately if a safe exit route exists; leave belongings behind.',
            'If evacuation is unsafe, shelter in a lockable room, silence phones, and stay away from windows.',
            'Submit a silent SOS alert with location consent only if it does not compromise concealment.',
            'Follow instructions from verified Campus Security and municipal law enforcement only.',
          ],
        },
        {
          id: 'proc-hazard',
          title: 'Chemical, Electrical & Infrastructure Hazard',
          steps: [
            'Keep clear of downed lines, leaking pipes, or unknown chemical containers.',
            'Warn nearby pedestrians and cordon off the immediate perimeter from a safe distance.',
            'Submit an Infrastructure Hazard report with a clear description and optional photo.',
          ],
        },
      ]),
    ],
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO campus_settings (key, value, updated_by, updated_at)
    VALUES (?, ?, NULL, ?)
  `);
  const tx = db.transaction(() => {
    for (const [k, v] of settingsDefaults) {
      insertSetting.run(k, v, now);
    }
  });
  tx();
}

export function writeAuditLog(
  actorId: string | null,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown> = {}
): void {
  try {
    db.prepare(`
      INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      actorId,
      action,
      resourceType,
      resourceId,
      new Date().toISOString(),
      JSON.stringify(metadata)
    );
  } catch (err) {
    console.error('Audit log write failed:', err);
  }
}

export function generateIncidentNumber(isSos: boolean): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
  const prefix = isSos ? 'SOS' : 'INC';
  return `${prefix}-${y}${m}${d}-${suffix}`;
}
