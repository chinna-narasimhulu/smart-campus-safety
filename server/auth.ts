import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db.ts';

export type UserRole = 'student' | 'faculty' | 'responder' | 'admin';

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  role: UserRole;
  responder_specialty: string;
  account_status: string;
  email_verified: number;
  is_test_account: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

// Ephemeral fallback secret if SESSION_SECRET is unset (never hardcoded, never written to disk)
const RUNTIME_SIGNING_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16
    ? process.env.SESSION_SECRET
    : crypto.randomBytes(32).toString('hex');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

export function signToken(userId: string, role: UserRole): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      role,
      iat: nowSec,
      exp: nowSec + 60 * 60 * 12, // 12-hour session
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', RUNTIME_SIGNING_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifyToken(token: string): { sub: string; role: UserRole; exp: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, payload, sig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', RUNTIME_SIGNING_SECRET)
      .update(`${header}.${payload}`)
      .digest('base64url');

    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: string;
      role?: UserRole;
      exp?: number;
    };
    if (!decoded.sub || !decoded.role || !decoded.exp) return null;
    if (decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return { sub: decoded.sub, role: decoded.role, exp: decoded.exp };
  } catch {
    return null;
  }
}

export function getActiveUserById(userId: string): AuthUser | null {
  const row = db
    .prepare(
      `SELECT id, full_name, email, phone, department, role, responder_specialty, account_status, email_verified, is_test_account
       FROM profiles WHERE id = ?`
    )
    .get(userId) as AuthUser | undefined;
  if (!row || row.account_status !== 'active') return null;
  return row;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  const decoded = verifyToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  const user = getActiveUserById(decoded.sub);
  if (!user) {
    res.status(401).json({ error: 'Account is inactive or unavailable.' });
    return;
  }

  req.user = user;
  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action.' });
      return;
    }
    next();
  };
}

export function cleanText(input: unknown, maxLength = 2000): string {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLength);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function isStrongPassword(password: string): boolean {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}
