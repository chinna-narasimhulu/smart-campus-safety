import {
  AlertOctagon,
  BarChart3,
  Bell,
  BookOpen,
  ClipboardList,
  FilePlus2,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Phone,
  Settings,
  Shield,
  User as UserIcon,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { AdminDashboard, type AdminSubView } from './components/AdminDashboard';
import {
  ArchitectureDiagramsView,
  EmergencyContactsView,
  PublicPages,
  SafetyGuidanceView,
  type PublicView,
} from './components/PublicPages';
import { ResponderDashboard, type ResponderSubView } from './components/ResponderDashboard';
import { formatRelativeTime } from './components/StatusText';
import { StudentDashboard, type StudentSubView } from './components/StudentDashboard';
import { AuthProvider, useAuth } from './context/AuthContext';

function CampusSafetyShell() {
  const {
    user,
    loading,
    realtimeConnected,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    logout,
  } = useAuth();

  const [publicView, setPublicView] = useState<PublicView>('landing');
  const [studentView, setStudentView] = useState<StudentSubView>('overview');
  const [responderView, setResponderView] = useState<ResponderSubView>('overview');
  const [adminView, setAdminView] = useState<AdminSubView>('overview');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [sosOpen, setSosOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm text-slate-600">
        Initializing Smart Campus Safety System...
      </div>
    );
  }

  // Unauthenticated Public Shell (3-Zone Top Bar Contract)
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
            <button
              type="button"
              onClick={() => setPublicView('landing')}
              className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
            >
              Smart Campus Safety
            </button>

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600" aria-label="Public navigation">
              <button
                type="button"
                onClick={() => setPublicView('contacts')}
                className={`whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  publicView === 'contacts' ? 'text-slate-900 underline underline-offset-4' : ''
                }`}
              >
                Emergency Contacts
              </button>
              <button
                type="button"
                onClick={() => setPublicView('guidance')}
                className={`whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  publicView === 'guidance' ? 'text-slate-900 underline underline-offset-4' : ''
                }`}
              >
                Safety Guidance
              </button>
              <button
                type="button"
                onClick={() => setPublicView('architecture')}
                className={`whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  publicView === 'architecture' ? 'text-slate-900 underline underline-offset-4' : ''
                }`}
              >
                Architecture
              </button>
              <button
                type="button"
                onClick={() => setPublicView('register')}
                className={`whitespace-nowrap shrink-0 hover:text-slate-900 ${
                  publicView === 'register' ? 'text-slate-900 underline underline-offset-4' : ''
                }`}
              >
                Register
              </button>
            </nav>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setPublicView('login')}
                className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setMobileNavOpen((v) => !v)}
                className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
                aria-label="Toggle navigation menu"
              >
                {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {mobileNavOpen && (
            <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 flex flex-col gap-2 text-sm">
              <button
                type="button"
                onClick={() => {
                  setPublicView('contacts');
                  setMobileNavOpen(false);
                }}
                className="text-left py-2 font-medium text-slate-800"
              >
                Emergency Contacts
              </button>
              <button
                type="button"
                onClick={() => {
                  setPublicView('guidance');
                  setMobileNavOpen(false);
                }}
                className="text-left py-2 font-medium text-slate-800"
              >
                Safety Guidance
              </button>
              <button
                type="button"
                onClick={() => {
                  setPublicView('architecture');
                  setMobileNavOpen(false);
                }}
                className="text-left py-2 font-medium text-slate-800"
              >
                Architecture & Diagrams
              </button>
              <button
                type="button"
                onClick={() => {
                  setPublicView('register');
                  setMobileNavOpen(false);
                }}
                className="text-left py-2 font-medium text-slate-800"
              >
                Register Student / Faculty
              </button>
            </div>
          )}
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
          <PublicPages view={publicView} onNavigate={setPublicView} />
        </main>

        <footer className="bg-white border-t border-slate-200 py-6 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <span>Smart Campus Safety & Emergency Response System</span>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => setPublicView('contacts')} className="hover:text-slate-900">
                Emergency Contacts
              </button>
              <button type="button" onClick={() => setPublicView('guidance')} className="hover:text-slate-900">
                Safety Guidance
              </button>
              <button type="button" onClick={() => setPublicView('architecture')} className="hover:text-slate-900">
                System Documentation
              </button>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // Authenticated Role-Based Workspace
  const isStudentOrFaculty = user.role === 'student' || user.role === 'faculty';
  const isResponder = user.role === 'responder';
  const isAdmin = user.role === 'admin';

  const navItems: Array<{
    id: string;
    label: string;
    icon: typeof LayoutDashboard;
    active: boolean;
    onClick: () => void;
  }> = isStudentOrFaculty
    ? [
        {
          id: 'overview',
          label: 'Dashboard',
          icon: LayoutDashboard,
          active: studentView === 'overview',
          onClick: () => setStudentView('overview'),
        },
        {
          id: 'report',
          label: 'Report Incident',
          icon: FilePlus2,
          active: studentView === 'report',
          onClick: () => setStudentView('report'),
        },
        {
          id: 'my-incidents',
          label: 'My Incidents',
          icon: FolderKanban,
          active: studentView === 'my-incidents' || studentView === 'detail',
          onClick: () => setStudentView('my-incidents'),
        },
        {
          id: 'contacts',
          label: 'Emergency Contacts',
          icon: Phone,
          active: studentView === 'contacts',
          onClick: () => setStudentView('contacts'),
        },
        {
          id: 'guidance',
          label: 'Safety Guidance',
          icon: BookOpen,
          active: studentView === 'guidance',
          onClick: () => setStudentView('guidance'),
        },
        {
          id: 'profile',
          label: 'Profile & Settings',
          icon: UserIcon,
          active: studentView === 'profile',
          onClick: () => setStudentView('profile'),
        },
      ]
    : isResponder
    ? [
        {
          id: 'overview',
          label: 'Dispatch Console',
          icon: LayoutDashboard,
          active: responderView === 'overview',
          onClick: () => setResponderView('overview'),
        },
        {
          id: 'incoming',
          label: 'Incoming Alerts',
          icon: AlertOctagon,
          active: responderView === 'incoming',
          onClick: () => setResponderView('incoming'),
        },
        {
          id: 'assigned',
          label: 'Assigned to Me',
          icon: FolderKanban,
          active: responderView === 'assigned' || responderView === 'detail',
          onClick: () => setResponderView('assigned'),
        },
        {
          id: 'history',
          label: 'Response History',
          icon: ClipboardList,
          active: responderView === 'history',
          onClick: () => setResponderView('history'),
        },
      ]
    : [
        {
          id: 'overview',
          label: 'Admin Overview',
          icon: LayoutDashboard,
          active: adminView === 'overview',
          onClick: () => setAdminView('overview'),
        },
        {
          id: 'incidents',
          label: 'Incidents & Dispatch',
          icon: AlertOctagon,
          active: adminView === 'incidents' || adminView === 'detail',
          onClick: () => setAdminView('incidents'),
        },
        {
          id: 'responders',
          label: 'Responders',
          icon: Shield,
          active: adminView === 'responders',
          onClick: () => setAdminView('responders'),
        },
        {
          id: 'users',
          label: 'User Accounts',
          icon: Users,
          active: adminView === 'users',
          onClick: () => setAdminView('users'),
        },
        {
          id: 'analytics',
          label: 'Reports & Analytics',
          icon: BarChart3,
          active: adminView === 'analytics',
          onClick: () => setAdminView('analytics'),
        },
        {
          id: 'audit',
          label: 'Audit Logs',
          icon: ClipboardList,
          active: adminView === 'audit',
          onClick: () => setAdminView('audit'),
        },
        {
          id: 'settings',
          label: 'System Settings',
          icon: Settings,
          active: adminView === 'settings',
          onClick: () => setAdminView('settings'),
        },
      ];

  const handleOpenNotification = (incidentId: string | null, notifId: string) => {
    void markNotificationRead(notifId);
    setNotifOpen(false);
    if (!incidentId) return;
    setSelectedIncidentId(incidentId);
    if (isStudentOrFaculty) setStudentView('detail');
    else if (isResponder) setResponderView('detail');
    else if (isAdmin) setAdminView('detail');
  };

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Dark Navy Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-slate-900 text-white shrink-0">
        <div className="h-16 px-5 flex items-center border-b border-slate-800">
          <span className="text-base font-extrabold tracking-tight whitespace-nowrap">
            Smart Campus Safety
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1" aria-label="Workspace navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  item.active
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3 text-xs">
          <div className="space-y-0.5">
            <div className="font-semibold text-white truncate">{user.full_name}</div>
            <div className="text-slate-400 capitalize">{user.role}</div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen((v) => !v)}
              className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-semibold text-slate-800 truncate">
              <span className="text-slate-500 font-normal">Workspace / </span>
              <span className="capitalize">{user.role}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span
              className="hidden sm:inline-block text-xs text-slate-500 whitespace-nowrap"
              title={realtimeConnected ? 'WebSocket live channel active' : 'Polling fallback active'}
            >
              {realtimeConnected ? 'Live Updates Connected' : 'Sync Polling Active'}
            </span>

            {isStudentOrFaculty && (
              <button
                type="button"
                onClick={() => setSosOpen(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-bold whitespace-nowrap shrink-0"
              >
                <AlertOctagon className="w-3.5 h-3.5" aria-hidden="true" />
                <span>SOS</span>
              </button>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
                aria-label={`Notifications (${unreadCount} unread)`}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-lg z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void markAllNotificationsRead()}
                        className="text-xs font-semibold text-slate-700 hover:text-slate-900 underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-xs text-slate-500 text-center">No notifications yet.</div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleOpenNotification(n.incident_id, n.id)}
                          className={`w-full text-left p-3.5 hover:bg-slate-50 space-y-1 ${
                            !n.read_at ? 'bg-red-50/40' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900">{n.title}</span>
                            <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                              {formatRelativeTime(n.created_at)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-snug">{n.message}</p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileNavOpen && (
          <div className="lg:hidden bg-slate-900 text-white px-4 py-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    item.onClick();
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                    item.active ? 'bg-slate-800 text-white' : 'text-slate-300'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-300"
            >
              <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {isStudentOrFaculty && studentView === 'contacts' && <EmergencyContactsView />}
          {isStudentOrFaculty && studentView === 'guidance' && <SafetyGuidanceView />}
          {isStudentOrFaculty && studentView !== 'contacts' && studentView !== 'guidance' && (
            <StudentDashboard
              activeView={studentView}
              selectedIncidentId={selectedIncidentId}
              sosOpen={sosOpen}
              setSosOpen={setSosOpen}
              onNavigate={(view, incId) => {
                if (incId !== undefined) setSelectedIncidentId(incId);
                setStudentView(view);
              }}
            />
          )}

          {isResponder && (
            <ResponderDashboard
              activeView={responderView}
              selectedIncidentId={selectedIncidentId}
              onNavigate={(view, incId) => {
                if (incId !== undefined) setSelectedIncidentId(incId);
                setResponderView(view);
              }}
            />
          )}

          {isAdmin && (
            <AdminDashboard
              activeView={adminView}
              selectedIncidentId={selectedIncidentId}
              onNavigate={(view, incId) => {
                if (incId !== undefined) setSelectedIncidentId(incId);
                setAdminView(view);
              }}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CampusSafetyShell />
    </AuthProvider>
  );
}
