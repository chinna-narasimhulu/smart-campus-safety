import {
  AlertOctagon,
  BookOpen,
  CheckCircle2,
  KeyRound,
  Lock,
  MapPin,
  Phone,
  Shield,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import type { CampusGuidance, EmergencyContact, UserProfile } from '../types';

export type PublicView =
  | 'landing'
  | 'login'
  | 'register'
  | 'forgot-password'
  | 'reset-password'
  | 'contacts'
  | 'guidance'
  | 'architecture';

export function EmergencyContactsView() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ contacts: EmergencyContact[] }>('/api/public/emergency-contacts')
      .then((res) => setContacts(res.contacts))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-red-700 text-white rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Campus Emergency Contact Directory</h1>
          <p className="text-sm text-red-100 mt-1">
            Direct telephone and email contacts for 24/7 Campus Security, Medical Triage, Fire Safety, and Crisis Support.
          </p>
        </div>
        <a
          href="tel:911"
          className="px-5 py-3 rounded-lg bg-white text-red-700 font-extrabold text-sm whitespace-nowrap text-center hover:bg-red-50"
        >
          Life-Threatening: Dial 911
        </a>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
          Loading emergency contacts...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contacts.map((c) => (
            <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
              <div className="text-xs font-semibold text-slate-500">
                {c.department} · {c.availability}
              </div>
              <h2 className="text-base font-bold text-slate-900">{c.name}</h2>
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <a
                  href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}
                  className="inline-flex items-center gap-1.5 text-sm font-mono font-bold text-red-700 hover:underline tabular-nums"
                >
                  <Phone className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{c.phone}</span>
                </a>
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="text-xs font-medium text-slate-700 hover:text-slate-900 underline"
                  >
                    {c.email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SafetyGuidanceView() {
  const [guidance, setGuidance] = useState<CampusGuidance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ guidance: CampusGuidance }>('/api/public/guidance')
      .then((res) => setGuidance(res.guidance))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <h1 className="text-2xl font-bold text-slate-900">Campus Safety Procedures & Guidance</h1>
        <p className="text-sm text-slate-600 mt-1">
          Standard operating safety protocols for {guidance?.campus_name || 'University Campus'}. Follow verified instructions during active incidents.
        </p>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
          Loading campus safety procedures...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(guidance?.emergency_procedures || []).map((proc, index) => (
            <div key={proc.id} className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <div className="text-xs font-semibold text-slate-500">
                Protocol 0{index + 1}
              </div>
              <h2 className="text-lg font-bold text-slate-900">{proc.title}</h2>
              <ol className="space-y-2 text-sm text-slate-700 list-decimal pl-5">
                {proc.steps.map((step, i) => (
                  <li key={i} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ArchitectureDiagramsView() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">System Architecture & Relational Database Diagrams</h1>
        <p className="text-sm text-slate-600">
          Technical architecture, entity-relationship model, and RBAC data-flow specification for the Smart Campus Safety & Emergency Response System. Complete SQL migrations, RLS policies, Edge Functions, test cases, and the project report are included in <code className="font-mono">/supabase</code> and <code className="font-mono">/docs</code>.
        </p>
      </div>

      {/* System Architecture SVG */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h2 className="text-base font-bold text-slate-900">01. System Architecture Diagram</h2>
        <div className="overflow-x-auto">
          <svg viewBox="0 0 880 280" className="w-full min-w-[680px] h-auto" role="img" aria-label="System Architecture Diagram">
            <rect x="16" y="30" width="210" height="210" rx="10" fill="#F8FAFC" stroke="#CBD5E1" />
            <text x="121" y="58" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0F172A">Client Presentation Layer</text>
            <rect x="34" y="76" width="174" height="36" rx="6" fill="#FFFFFF" stroke="#94A3B8" />
            <text x="121" y="99" textAnchor="middle" fontSize="11" fill="#1E293B">Student / Faculty Portal</text>
            <rect x="34" y="122" width="174" height="36" rx="6" fill="#FFFFFF" stroke="#94A3B8" />
            <text x="121" y="145" textAnchor="middle" fontSize="11" fill="#1E293B">Responder Dispatch Console</text>
            <rect x="34" y="168" width="174" height="36" rx="6" fill="#FFFFFF" stroke="#94A3B8" />
            <text x="121" y="191" textAnchor="middle" fontSize="11" fill="#1E293B">Leaflet + OpenStreetMap + GPS</text>

            <line x1="226" y1="135" x2="296" y2="135" stroke="#0F172A" strokeWidth="2" />
            <text x="261" y="125" textAnchor="middle" fontSize="10" fill="#475569">HTTPS / WS</text>

            <rect x="296" y="30" width="260" height="210" rx="10" fill="#0F172A" />
            <text x="426" y="58" textAnchor="middle" fontSize="13" fontWeight="700" fill="#FFFFFF">Application & Security Layer</text>
            <rect x="316" y="76" width="220" height="36" rx="6" fill="#1E293B" stroke="#475569" />
            <text x="426" y="99" textAnchor="middle" fontSize="11" fill="#F8FAFC">Auth & RBAC Middleware (HMAC + scrypt)</text>
            <rect x="316" y="122" width="220" height="36" rx="6" fill="#DC2626" />
            <text x="426" y="145" textAnchor="middle" fontSize="11" fontWeight="700" fill="#FFFFFF">SOS / Incident Transactional API</text>
            <rect x="316" y="168" width="220" height="36" rx="6" fill="#1E293B" stroke="#475569" />
            <text x="426" y="191" textAnchor="middle" fontSize="11" fill="#F8FAFC">WebSocket Realtime + Escalation Monitor</text>

            <line x1="556" y1="135" x2="626" y2="135" stroke="#0F172A" strokeWidth="2" />
            <text x="591" y="125" textAnchor="middle" fontSize="10" fill="#475569">SQL / FS</text>

            <rect x="626" y="30" width="236" height="210" rx="10" fill="#F8FAFC" stroke="#CBD5E1" />
            <text x="744" y="58" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0F172A">Persistence & Audit Layer</text>
            <rect x="644" y="76" width="200" height="44" rx="6" fill="#FFFFFF" stroke="#94A3B8" />
            <text x="744" y="96" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1E293B">Relational SQL Database</text>
            <text x="744" y="111" textAnchor="middle" fontSize="10" fill="#64748B">profiles · incidents · locations · updates</text>
            <rect x="644" y="130" width="200" height="36" rx="6" fill="#FFFFFF" stroke="#94A3B8" />
            <text x="744" y="153" textAnchor="middle" fontSize="11" fill="#1E293B">Immutable Audit Logs & Notifications</text>
            <rect x="644" y="176" width="200" height="36" rx="6" fill="#FFFFFF" stroke="#94A3B8" />
            <text x="744" y="199" textAnchor="middle" fontSize="11" fill="#1E293B">Confined Attachment Storage</text>
          </svg>
        </div>
      </div>

      {/* ER & Workflow summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900">02. Normalized Database Entities</h2>
          <ul className="text-xs text-slate-700 space-y-2 leading-relaxed">
            <li><strong className="font-mono text-slate-900">profiles</strong>: UUID PK, role (student, faculty, responder, admin), account_status, scrypt password hash.</li>
            <li><strong className="font-mono text-slate-900">incidents</strong>: UUID PK, unique incident_number, reporter_id FK, is_sos, priority, status, idempotency_key.</li>
            <li><strong className="font-mono text-slate-900">incident_locations</strong>: 1:1 FK to incidents, consent_given, consent_time, captured_at, lat/lng.</li>
            <li><strong className="font-mono text-slate-900">incident_assignments</strong>: M:N link between incidents & responders with accept/decline tracking.</li>
            <li><strong className="font-mono text-slate-900">incident_updates</strong>: Chronological timeline with public vs internal personnel visibility.</li>
            <li><strong className="font-mono text-slate-900">notifications & audit_logs</strong>: Delivery telemetry and immutable security trail.</li>
          </ul>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-900">03. Incident Status Lifecycle</h2>
          <div className="text-xs text-slate-700 space-y-2 leading-relaxed">
            <p>
              <strong className="text-slate-900">Submitted</strong> → <strong className="text-slate-900">Acknowledged</strong> → <strong className="text-slate-900">Assigned</strong> → <strong className="text-slate-900">In Progress</strong> → <strong className="text-emerald-700">Resolved</strong> → <strong className="text-emerald-700">Closed</strong>
            </p>
            <p>
              Unacknowledged critical/SOS alerts automatically transition to <strong className="text-red-700">Escalated</strong> after the administrator-configured threshold (default 5 minutes).
            </p>
            <p>
              Reporters may transition their own <strong className="text-slate-900">Submitted</strong> or <strong className="text-slate-900">Acknowledged</strong> alerts to <strong className="text-slate-600">Cancelled</strong> with confirmation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PublicPagesProps {
  view: PublicView;
  onNavigate: (view: PublicView) => void;
}

export function PublicPages({ view, onNavigate }: PublicPagesProps) {
  const { bootstrapStatus, loginWithToken } = useAuth();

  // Auth form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [regRole, setRegRole] = useState<'student' | 'faculty'>('student');
  const [bootstrapPasscode, setBootstrapPasscode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tokenPreview, setTokenPreview] = useState('');
  const [verifyCodeInput, setVerifyCodeInput] = useState('');
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [unitImgFailed, setUnitImgFailed] = useState(false);

  const resetMessages = () => {
    setError('');
    setNotice('');
    setTokenPreview('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      const data = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      loginWithToken(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleBootstrapAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      const data = await apiFetch<{ token: string; user: UserProfile }>('/api/auth/bootstrap-admin', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          email,
          password,
          phone,
          department,
          passcode: bootstrapPasscode,
        }),
      });
      loginWithToken(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize administrator.');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      const data = await apiFetch<{
        token: string;
        user: UserProfile;
        emailVerificationNotice?: string;
        verificationTokenPreview?: string;
      }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          email,
          password,
          phone,
          department,
          role: regRole,
        }),
      });
      if (data.verificationTokenPreview) {
        setTokenPreview(data.verificationTokenPreview);
        setVerifyCodeInput(data.verificationTokenPreview);
        setNotice(
          `${data.emailVerificationNotice || ''} Click "Verify & Enter Portal" below or verify later in Profile Settings.`
        );
        // Hold token temporarily in state or verify first, or sign in right away
        loginWithToken(data.token, data.user);
      } else {
        loginWithToken(data.token, data.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      const data = await apiFetch<{ message: string; resetTokenPreview?: string }>(
        '/api/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        }
      );
      setNotice(data.message);
      if (data.resetTokenPreview) {
        setTokenPreview(data.resetTokenPreview);
        setResetToken(data.resetTokenPreview);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setBusy(true);
    try {
      const data = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      setNotice(data.message);
      setResetToken('');
      setNewPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setBusy(false);
    }
  };

  if (view === 'contacts') return <EmergencyContactsView />;
  if (view === 'guidance') return <SafetyGuidanceView />;
  if (view === 'architecture') return <ArchitectureDiagramsView />;

  if (view === 'login') {
    return (
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Standard Sign In */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-5">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Sign In to Campus Safety</h1>
            <p className="text-sm text-slate-600 mt-1">
              Access your Student, Faculty, Authorized Responder, or Administrator portal.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-xs font-semibold text-slate-700 mb-1">
                Campus Email Address
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@campus.edu"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="login-pw" className="block text-xs font-semibold text-slate-700 mb-1">
                Password
              </label>
              <input
                id="login-pw"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  onNavigate('forgot-password');
                }}
                className="font-semibold text-slate-700 hover:text-slate-900 underline"
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => {
                  resetMessages();
                  onNavigate('register');
                }}
                className="font-semibold text-slate-900 hover:text-red-700 underline"
              >
                Create Student / Faculty Account
              </button>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-60"
            >
              {busy ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
        </div>

        {/* First-Run Administrator Claim OR Security Notice */}
        {bootstrapStatus.needsInitialAdmin ? (
          <div className="bg-slate-900 text-white rounded-xl p-6 md:p-8 space-y-5">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-red-400">First-Run System Setup</div>
              <h2 className="text-xl font-bold">Claim Initial Administrator Account</h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                No administrator exists yet. Create the primary Campus Safety Administrator account below to provision Responder accounts, configure campus policies, or load the academic demonstration dataset. This setup locks permanently once claimed.
              </p>
            </div>

            <form onSubmit={handleBootstrapAdmin} className="space-y-3.5">
              <div>
                <label htmlFor="admin-name" className="block text-xs font-medium text-slate-300 mb-1">
                  Administrator Full Name
                </label>
                <input
                  id="admin-name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Dr. / Officer Full Name"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="admin-email" className="block text-xs font-medium text-slate-300 mb-1">
                  Administrator Email
                </label>
                <input
                  id="admin-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@campus.edu"
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label htmlFor="admin-pw" className="block text-xs font-medium text-slate-300 mb-1">
                  Administrator Password (min 8 chars)
                </label>
                <input
                  id="admin-pw"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                />
              </div>
              {bootstrapStatus.passcodeRequired && (
                <div>
                  <label htmlFor="admin-passcode" className="block text-xs font-medium text-slate-300 mb-1">
                    Bootstrap Passcode (from server environment)
                  </label>
                  <input
                    id="admin-passcode"
                    type="password"
                    required
                    value={bootstrapPasscode}
                    onChange={(e) => setBootstrapPasscode(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-60"
              >
                {busy ? 'Creating Administrator...' : 'Initialize Administrator Account'}
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Lock className="w-5 h-5 text-slate-700" aria-hidden="true" />
              <span>Role-Based Access & Data Privacy</span>
            </h2>
            <ul className="space-y-3 text-sm text-slate-600 leading-relaxed">
              <li>
                <strong className="text-slate-900">Students & Faculty</strong> can submit SOS alerts, report incidents, share consented GPS locations, and view only their own reports.
              </li>
              <li>
                <strong className="text-slate-900">Authorized Responders</strong> receive emergency notifications, acknowledge alerts, update operational status, and record confidential responder notes.
              </li>
              <li>
                <strong className="text-slate-900">Administrators</strong> provision responder accounts, assign incidents, monitor response metrics, and review immutable audit logs.
              </li>
            </ul>
            <div className="pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => onNavigate('contacts')}
                className="text-xs font-semibold text-red-700 hover:underline"
              >
                Need immediate phone assistance? View 24/7 Campus Emergency Contacts
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'register') {
    return (
      <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-slate-700" aria-hidden="true" />
            <span>Register Campus Account</span>
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Self-registration is restricted to Student and Faculty accounts. Responder and Administrator roles can only be provisioned by an Administrator.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
            <p>{notice}</p>
            {tokenPreview && <p className="font-mono font-bold">Verification Token: {verifyCodeInput}</p>}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label htmlFor="reg-role" className="block text-xs font-semibold text-slate-700 mb-1">
              Campus Affiliation
            </label>
            <select
              id="reg-role"
              value={regRole}
              onChange={(e) => setRegRole(e.target.value as 'student' | 'faculty')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white"
            >
              <option value="student">Student</option>
              <option value="faculty">Faculty Member</option>
            </select>
          </div>
          <div>
            <label htmlFor="reg-name" className="block text-xs font-semibold text-slate-700 mb-1">
              Full Name
            </label>
            <input
              id="reg-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div>
            <label htmlFor="reg-email" className="block text-xs font-semibold text-slate-700 mb-1">
              Campus Email Address
            </label>
            <input
              id="reg-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@campus.edu"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="reg-phone" className="block text-xs font-semibold text-slate-700 mb-1">
                Phone (Optional)
              </label>
              <input
                id="reg-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label htmlFor="reg-dept" className="block text-xs font-semibold text-slate-700 mb-1">
                Department / Major
              </label>
              <input
                id="reg-dept"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g., Computer Science"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>
          </div>
          <div>
            <label htmlFor="reg-pw" className="block text-xs font-semibold text-slate-700 mb-1">
              Password (minimum 8 characters)
            </label>
            <input
              id="reg-pw"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-60"
          >
            {busy ? 'Creating Account...' : 'Create Account'}
          </button>
          <div className="text-center text-xs text-slate-600">
            Already registered?{' '}
            <button
              type="button"
              onClick={() => {
                resetMessages();
                onNavigate('login');
              }}
              className="font-semibold text-slate-900 underline"
            >
              Sign in here
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (view === 'forgot-password' || view === 'reset-password') {
    return (
      <div className="max-w-lg mx-auto bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-slate-700" aria-hidden="true" />
          <h1 className="text-xl font-bold text-slate-900">
            {view === 'forgot-password' ? 'Request Password Reset' : 'Reset Your Password'}
          </h1>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-2">
            <p>{notice}</p>
            {tokenPreview && (
              <div className="p-2 bg-white border border-emerald-300 rounded font-mono text-[11px] break-all">
                Reset Token: {tokenPreview}
              </div>
            )}
          </div>
        )}

        {view === 'forgot-password' ? (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label htmlFor="fp-email" className="block text-xs font-semibold text-slate-700 mb-1">
                Registered Email Address
              </label>
              <input
                id="fp-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
            >
              {busy ? 'Preparing Reset...' : 'Send Reset Instructions'}
            </button>
            <div className="flex justify-between text-xs">
              <button type="button" onClick={() => onNavigate('login')} className="underline text-slate-700">
                Back to Sign In
              </button>
              <button
                type="button"
                onClick={() => onNavigate('reset-password')}
                className="underline font-semibold text-slate-900"
              >
                Already have a reset token?
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <label htmlFor="rp-token" className="block text-xs font-semibold text-slate-700 mb-1">
                Password Reset Token
              </label>
              <input
                id="rp-token"
                type="text"
                required
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-mono"
              />
            </div>
            <div>
              <label htmlFor="rp-pw" className="block text-xs font-semibold text-slate-700 mb-1">
                New Password (min 8 characters)
              </label>
              <input
                id="rp-pw"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold"
            >
              {busy ? 'Resetting Password...' : 'Confirm Password Reset'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="text-xs underline text-slate-700"
            >
              Return to Sign In
            </button>
          </form>
        )}
      </div>
    );
  }

  // Landing Page
  return (
    <div className="space-y-14">
      {/* Hero Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-center space-y-6 py-2">
          <div className="text-xs font-semibold text-red-700 tracking-wide">
            24/7 Campus Emergency Coordination & Incident Reporting
          </div>
          <h1 className="text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.1] text-balance">
            Rapid Campus Safety Response When Seconds Matter
          </h1>
          <p className="text-base text-slate-600 leading-relaxed max-w-xl">
            A unified safety platform connecting students, faculty, medical staff, and campus security through consent-based location sharing, real-time responder dispatch, and transparent incident tracking.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-red-700 hover:bg-red-800 text-white text-sm font-bold whitespace-nowrap"
            >
              <AlertOctagon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Sign In for SOS & Reporting</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('contacts')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-sm font-semibold whitespace-nowrap"
            >
              <Phone className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Emergency Contacts</span>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500 pt-2 border-t border-slate-200">
            <span>Role-Based Access Control</span>
            <span aria-hidden="true">·</span>
            <span>Consent-Only Geolocation</span>
            <span aria-hidden="true">·</span>
            <span>Auditable Incident Timeline</span>
          </div>
        </div>

        <div className="lg:col-span-6 relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 min-h-[300px]">
          {!heroImgFailed ? (
            <img
              src="/src/assets/images/hero_campus_safety_1795446686846.jpg"
              alt="University campus quadrangle at dusk showing illuminated walkways and an emergency safety beacon"
              referrerPolicy="no-referrer"
              onError={() => setHeroImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full min-h-[300px] bg-gradient-to-br from-slate-900 via-slate-800 to-red-950 flex items-center justify-center p-8 text-center">
              <Shield className="w-16 h-16 text-white/40" aria-hidden="true" />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent p-6 text-white">
            <div className="text-sm font-semibold">Campus Emergency Beacon & Dispatch Network</div>
            <div className="text-xs text-slate-200 mt-0.5">
              Direct web reporting paired with 24/7 Campus Security Control Room coordination
            </div>
          </div>
        </div>
      </section>

      {/* Core Capabilities */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
          <AlertOctagon className="w-6 h-6 text-red-700" aria-hidden="true" />
          <h2 className="text-base font-bold text-slate-900">01. Immediate SOS & Incident Forms</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            One-tap SOS emergency confirmation with duplicate-submission protection alongside structured reporting for medical, fire, hazard, and security incidents.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
          <MapPin className="w-6 h-6 text-slate-900" aria-hidden="true" />
          <h2 className="text-base font-bold text-slate-900">02. Consent-Based Location & Maps</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Browser GPS coordinates are requested only upon explicit user action, paired with manual location descriptions and interactive OpenStreetMap dispatch pins.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
          <ShieldCheck className="w-6 h-6 text-emerald-700" aria-hidden="true" />
          <h2 className="text-base font-bold text-slate-900">03. Real-Time Responder Tracking</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Live WebSocket updates notify students and faculty when responders acknowledge, accept, or resolve incidents—with strict privacy isolation for internal notes.
          </p>
        </div>
      </section>

      {/* Dispatch Center Feature Split */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <div className="lg:col-span-5 bg-slate-900 min-h-[260px]">
          {!unitImgFailed ? (
            <img
              src="/src/assets/images/campus_response_unit_1795446686136.jpg"
              alt="Campus safety coordination team reviewing active incidents on a campus map console"
              referrerPolicy="no-referrer"
              onError={() => setUnitImgFailed(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-900 text-white/30">
              <ShieldCheck className="w-14 h-14" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="lg:col-span-7 p-6 md:p-8 flex flex-col justify-center space-y-4">
          <div className="text-xs font-semibold text-slate-500">Authorized Dispatch & Accountability</div>
          <h2 className="text-2xl font-bold text-slate-900">
            Traceable Incident Lifecycle from Alert to Resolution
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Every emergency alert and safety report receives a unique reference number, automatic priority routing, configurable escalation rules, and an immutable audit log for institutional review.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('guidance')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
            >
              <BookOpen className="w-4 h-4" aria-hidden="true" />
              <span>View Safety Procedures</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('architecture')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-semibold"
            >
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              <span>Architecture & ER Diagrams</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
