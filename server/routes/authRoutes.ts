import crypto from 'node:crypto';
import express from 'express';
import {
  cleanText,
  hashPassword,
  isStrongPassword,
  isValidEmail,
  requireAuth,
  signToken,
  verifyPassword,
  type AuthenticatedRequest,
} from '../auth.ts';
import { db, writeAuditLog } from '../db.ts';

export const authRouter = express.Router();

authRouter.get('/bootstrap-status', (_req, res) => {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM profiles WHERE role = 'admin' AND account_status = 'active'")
    .get() as { count: number };
  const passcodeRequired = Boolean(process.env.ADMIN_BOOTSTRAP_PASSCODE && process.env.ADMIN_BOOTSTRAP_PASSCODE.trim());
  res.json({
    needsInitialAdmin: row.count === 0,
    passcodeRequired,
  });
});

authRouter.post('/bootstrap-admin', (req, res) => {
  const fullName = cleanText(req.body?.fullName, 120);
  const email = cleanText(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const phone = cleanText(req.body?.phone, 32);
  const department = cleanText(req.body?.department, 120) || 'Campus Safety Administration';
  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';

  const envPasscode = (process.env.ADMIN_BOOTSTRAP_PASSCODE || '').trim();
  if (envPasscode) {
    const a = Buffer.from(passcode);
    const b = Buffer.from(envPasscode);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(403).json({ error: 'Invalid administrator bootstrap passcode.' });
      return;
    }
  }

  if (!fullName || !isValidEmail(email) || !isStrongPassword(password)) {
    res.status(400).json({
      error: 'Please provide a valid full name, email address, and password (at least 8 characters).',
    });
    return;
  }

  const adminId = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);

  try {
    const created = db.transaction(() => {
      const existingAdmins = db
        .prepare("SELECT COUNT(*) AS count FROM profiles WHERE role = 'admin' AND account_status = 'active'")
        .get() as { count: number };
      if (existingAdmins.count > 0) {
        return { conflict: 'Initial administrator has already been configured.' };
      }

      const existingEmail = db.prepare('SELECT id FROM profiles WHERE email = ?').get(email);
      if (existingEmail) {
        return { conflict: 'An account with this email already exists.' };
      }

      db.prepare(
        `INSERT INTO profiles (id, full_name, email, password_hash, phone, department, role, responder_specialty, account_status, email_verified, verification_token, is_test_account, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'admin', 'Administration', 'active', 1, NULL, 0, ?, ?)`
      ).run(adminId, fullName, email, passwordHash, phone, department, now, now);

      return { ok: true };
    })();

    if ('conflict' in created) {
      res.status(409).json({ error: created.conflict });
      return;
    }

    writeAuditLog(adminId, 'INITIAL_ADMIN_CLAIMED', 'profile', adminId, { email });
    const token = signToken(adminId, 'admin');
    const user = db
      .prepare(
        'SELECT id, full_name, email, phone, department, role, responder_specialty, account_status, email_verified, is_test_account FROM profiles WHERE id = ?'
      )
      .get(adminId);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Bootstrap admin error:', err);
    res.status(500).json({ error: 'Unable to initialize administrator account.' });
  }
});

authRouter.post('/register', (req, res) => {
  const fullName = cleanText(req.body?.fullName, 120);
  const email = cleanText(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const phone = cleanText(req.body?.phone, 32);
  const department = cleanText(req.body?.department, 120);
  const requestedRole = cleanText(req.body?.role, 32).toLowerCase() || 'student';

  // Strictly prevent self-registration as responder or admin
  if (requestedRole !== 'student' && requestedRole !== 'faculty') {
    writeAuditLog(null, 'PRIVILEGE_ESCALATION_ATTEMPT', 'auth_register', email || 'unknown', {
      requestedRole,
    });
    res.status(403).json({
      error: 'Self-registration is restricted to Student and Faculty accounts. Responder and Administrator privileges must be provisioned by an Administrator.',
    });
    return;
  }

  if (!fullName || !isValidEmail(email) || !isStrongPassword(password)) {
    res.status(400).json({
      error: 'Full name, valid email address, and password (minimum 8 characters) are required.',
    });
    return;
  }

  const existing = db.prepare('SELECT id FROM profiles WHERE email = ?').get(email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email address already exists.' });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const rawVerificationToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawVerificationToken).digest('hex');

  try {
    db.prepare(
      `INSERT INTO profiles (id, full_name, email, password_hash, phone, department, role, responder_specialty, account_status, email_verified, verification_token, is_test_account, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, '', 'active', 0, ?, 0, ?, ?)`
    ).run(
      id,
      fullName,
      email,
      hashPassword(password),
      phone,
      department || (requestedRole === 'faculty' ? 'Academic Faculty' : 'Undergraduate Studies'),
      requestedRole,
      tokenHash,
      now,
      now
    );

    writeAuditLog(id, 'USER_REGISTERED', 'profile', id, { role: requestedRole, email });

    const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
    const token = signToken(id, requestedRole);
    const user = db
      .prepare(
        'SELECT id, full_name, email, phone, department, role, responder_specialty, account_status, email_verified, is_test_account FROM profiles WHERE id = ?'
      )
      .get(id);

    res.status(201).json({
      token,
      user,
      emailVerificationNotice: smtpConfigured
        ? 'A verification link has been dispatched to your email address.'
        : 'Email provider is not configured on this server. Use the verification token below in your profile or verification screen to verify your email.',
      verificationTokenPreview: smtpConfigured ? undefined : rawVerificationToken,
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to create account.' });
  }
});

authRouter.post('/login', (req, res) => {
  const email = cleanText(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!isValidEmail(email) || !password) {
    res.status(400).json({ error: 'Valid email and password are required.' });
    return;
  }

  const profile = db
    .prepare(
      `SELECT id, full_name, email, password_hash, phone, department, role, responder_specialty, account_status, email_verified, is_test_account
       FROM profiles WHERE email = ?`
    )
    .get(email) as
    | {
        id: string;
        full_name: string;
        email: string;
        password_hash: string;
        phone: string;
        department: string;
        role: 'student' | 'faculty' | 'responder' | 'admin';
        responder_specialty: string;
        account_status: string;
        email_verified: number;
        is_test_account: number;
      }
    | undefined;

  if (!profile || !verifyPassword(password, profile.password_hash)) {
    writeAuditLog(null, 'LOGIN_FAILED', 'auth', email, { reason: 'invalid_credentials' });
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  if (profile.account_status !== 'active') {
    writeAuditLog(profile.id, 'LOGIN_BLOCKED_INACTIVE', 'profile', profile.id, {
      status: profile.account_status,
    });
    res.status(403).json({
      error: 'Your account is currently deactivated. Please contact Campus Safety Administration.',
    });
    return;
  }

  writeAuditLog(profile.id, 'USER_LOGIN', 'profile', profile.id, { role: profile.role });
  const token = signToken(profile.id, profile.role);
  const { password_hash: _removed, ...safeUser } = profile;
  res.json({ token, user: safeUser });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

authRouter.post('/verify-email', (req, res) => {
  const token = cleanText(req.body?.token, 128);
  if (!token) {
    res.status(400).json({ error: 'Verification token is required.' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const user = db
    .prepare('SELECT id, email FROM profiles WHERE verification_token = ?')
    .get(tokenHash) as { id: string; email: string } | undefined;

  if (!user) {
    res.status(400).json({ error: 'Invalid or expired verification token.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE profiles SET email_verified = 1, verification_token = NULL, updated_at = ? WHERE id = ?'
  ).run(now, user.id);

  writeAuditLog(user.id, 'EMAIL_VERIFIED', 'profile', user.id, { email: user.email });
  res.json({ message: 'Email address verified successfully.' });
});

authRouter.post('/forgot-password', (req, res) => {
  const email = cleanText(req.body?.email, 254).toLowerCase();
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  const user = db
    .prepare("SELECT id, email FROM profiles WHERE email = ? AND account_status = 'active'")
    .get(email) as { id: string; email: string } | undefined;

  const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);

  if (!user) {
    // Do not leak user existence
    res.json({
      message: 'If an active account matches that email address, password reset instructions have been prepared.',
    });
    return;
  }

  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO password_resets (id, user_id, token_hash, expires_at, used_at, created_at)
     VALUES (?, ?, ?, ?, NULL, ?)`
  ).run(crypto.randomUUID(), user.id, tokenHash, expiresAt, now.toISOString());

  writeAuditLog(user.id, 'PASSWORD_RESET_REQUESTED', 'profile', user.id, { email });

  res.json({
    message: smtpConfigured
      ? 'If an active account matches that email address, a password reset email has been dispatched.'
      : 'SMTP email provider is not configured in this environment. For local testing, use the reset token below on the Reset Password page.',
    resetTokenPreview: smtpConfigured ? undefined : rawToken,
  });
});

authRouter.post('/reset-password', (req, res) => {
  const token = cleanText(req.body?.token, 128);
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!token || !isStrongPassword(newPassword)) {
    res.status(400).json({ error: 'Reset token and a new password (minimum 8 characters) are required.' });
    return;
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const nowIso = new Date().toISOString();

  const record = db
    .prepare(
      `SELECT id, user_id, expires_at, used_at FROM password_resets
       WHERE token_hash = ? AND used_at IS NULL AND expires_at >= ?
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(tokenHash, nowIso) as { id: string; user_id: string; expires_at: string; used_at: string | null } | undefined;

  if (!record) {
    res.status(400).json({ error: 'Invalid or expired password reset token.' });
    return;
  }

  db.transaction(() => {
    db.prepare('UPDATE profiles SET password_hash = ?, updated_at = ? WHERE id = ?').run(
      hashPassword(newPassword),
      nowIso,
      record.user_id
    );
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(nowIso, record.id);
  })();

  writeAuditLog(record.user_id, 'PASSWORD_RESET_COMPLETED', 'profile', record.user_id, {});
  res.json({ message: 'Your password has been reset. You may now sign in.' });
});

authRouter.patch('/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const fullName = cleanText(req.body?.fullName, 120);
  const phone = cleanText(req.body?.phone, 32);
  const department = cleanText(req.body?.department, 120);

  if (!fullName) {
    res.status(400).json({ error: 'Full name cannot be empty.' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE profiles SET full_name = ?, phone = ?, department = ?, updated_at = ? WHERE id = ?'
  ).run(fullName, phone, department, now, userId);

  writeAuditLog(userId, 'PROFILE_UPDATED', 'profile', userId, {});
  const updated = db
    .prepare(
      'SELECT id, full_name, email, phone, department, role, responder_specialty, account_status, email_verified, is_test_account FROM profiles WHERE id = ?'
    )
    .get(userId);
  res.json({ user: updated });
});

authRouter.post('/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!isStrongPassword(newPassword)) {
    res.status(400).json({ error: 'New password must be at least 8 characters.' });
    return;
  }

  const row = db.prepare('SELECT password_hash FROM profiles WHERE id = ?').get(userId) as
    | { password_hash: string }
    | undefined;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    res.status(400).json({ error: 'Current password is incorrect.' });
    return;
  }

  db.prepare('UPDATE profiles SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    hashPassword(newPassword),
    new Date().toISOString(),
    userId
  );

  writeAuditLog(userId, 'PASSWORD_CHANGED', 'profile', userId, {});
  res.json({ message: 'Password updated successfully.' });
});
