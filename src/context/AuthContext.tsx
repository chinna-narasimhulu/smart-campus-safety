import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { apiFetch, getAuthToken, setAuthToken } from '../lib/api';
import type { NotificationItem, UserProfile } from '../types';

interface BootstrapStatus {
  needsInitialAdmin: boolean;
  passcodeRequired: boolean;
}

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  bootstrapStatus: BootstrapStatus;
  realtimeConnected: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  lastRealtimeTick: number;
  refreshBootstrapStatus: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  loginWithToken: (token: string, user: UserProfile) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>({
    needsInitialAdmin: false,
    passcodeRequired: false,
  });
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [lastRealtimeTick, setLastRealtimeTick] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const refreshBootstrapStatus = useCallback(async () => {
    try {
      const data = await apiFetch<BootstrapStatus>('/api/auth/bootstrap-status');
      setBootstrapStatus(data);
    } catch (err) {
      console.error('Bootstrap status check failed:', err);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!getAuthToken()) return;
    try {
      const data = await apiFetch<{ notifications: NotificationItem[] }>('/api/public/notifications');
      setNotifications(data.notifications);
    } catch {
      // Ignore transient notification fetch failures
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getAuthToken()) {
      setUser(null);
      return;
    }
    try {
      const data = await apiFetch<{ user: UserProfile }>('/api/auth/me');
      setUser(data.user);
    } catch {
      setAuthToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refreshBootstrapStatus();
      setLoading(false);
    })();
  }, [refreshBootstrapStatus]);

  // WebSocket real-time connection + fallback polling when WS is disconnected
  useEffect(() => {
    const token = getAuthToken();
    if (!user || !token) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setRealtimeConnected(false);
      return;
    }

    let cancelled = false;

    const connectWs = () => {
      if (cancelled) return;
      const currentToken = getAuthToken();
      if (!currentToken) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(currentToken)}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setRealtimeConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data as string) as {
            type: string;
            payload?: Record<string, unknown>;
          };
          if (parsed.type === 'incident:created' || parsed.type === 'incident:updated') {
            setLastRealtimeTick(Date.now());
            void refreshNotifications();
          } else if (parsed.type === 'notification:new') {
            setLastRealtimeTick(Date.now());
            void refreshNotifications();
            // Trigger Web Notification API if user granted permission
            if (
              typeof Notification !== 'undefined' &&
              Notification.permission === 'granted' &&
              parsed.payload
            ) {
              try {
                new Notification(String(parsed.payload.title || 'Campus Safety Alert'), {
                  body: String(parsed.payload.message || ''),
                });
              } catch {
                // Ignore browser notification restrictions inside sandboxed frames
              }
            }
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onclose = () => {
        if (!cancelled) {
          setRealtimeConnected(false);
          reconnectTimerRef.current = window.setTimeout(connectWs, 5000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connectWs();
    void refreshNotifications();

    // Fallback polling when real-time connection is down
    const fallbackTimer = window.setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setLastRealtimeTick(Date.now());
        void refreshNotifications();
      }
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(fallbackTimer);
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user, refreshNotifications]);

  const loginWithToken = useCallback(
    (token: string, loggedInUser: UserProfile) => {
      setAuthToken(token);
      setUser(loggedInUser);
      void refreshBootstrapStatus();
    },
    [refreshBootstrapStatus]
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setNotifications([]);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setRealtimeConnected(false);
  }, []);

  const markNotificationRead = useCallback(async (id: string) => {
    await apiFetch(`/api/public/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n))
    );
  }, []);

  const markAllNotificationsRead = useCallback(async () => {
    await apiFetch('/api/public/notifications/read-all', { method: 'POST' });
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || now })));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        bootstrapStatus,
        realtimeConnected,
        notifications,
        unreadCount,
        lastRealtimeTick,
        refreshBootstrapStatus,
        refreshUser,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        loginWithToken,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
