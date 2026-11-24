import type { Server as HttpServer } from 'node:http';
import crypto from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { getActiveUserById, verifyToken, type UserRole } from './auth.ts';
import { db, writeAuditLog } from './db.ts';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  role: UserRole;
  isAlive: boolean;
}

const clients = new Set<ConnectedClient>();

export function initRealtimeServer(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname !== '/ws') {
      return;
    }

    const token = url.searchParams.get('token') || '';
    const decoded = verifyToken(token);
    if (!decoded) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const user = getActiveUserById(decoded.sub);
    if (!user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, user);
    });
  });

  wss.on('connection', (ws: WebSocket, user: { id: string; role: UserRole }) => {
    const client: ConnectedClient = {
      ws,
      userId: user.id,
      role: user.role,
      isAlive: true,
    };
    clients.add(client);

    ws.send(
      JSON.stringify({
        type: 'connection:established',
        payload: { userId: user.id, role: user.role, timestamp: new Date().toISOString() },
      })
    );

    ws.on('pong', () => {
      client.isAlive = true;
    });

    ws.on('close', () => {
      clients.delete(client);
    });

    ws.on('error', () => {
      clients.delete(client);
    });
  });

  // Heartbeat to prune dead sockets
  const heartbeatInterval = setInterval(() => {
    for (const client of clients) {
      if (!client.isAlive) {
        client.ws.terminate();
        clients.delete(client);
        continue;
      }
      client.isAlive = false;
      client.ws.ping();
    }
  }, 30000);

  // Automatic Escalation Checker for unacknowledged SOS/critical alerts
  const escalationInterval = setInterval(() => {
    try {
      const thresholdRow = db
        .prepare("SELECT value FROM campus_settings WHERE key = 'escalation_threshold_minutes'")
        .get() as { value: string } | undefined;
      const thresholdMinutes = Math.max(1, Number(thresholdRow?.value || 5));
      const cutoffIso = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();

      const staleIncidents = db
        .prepare(
          `SELECT id, incident_number, reporter_id, priority, is_sos, title
           FROM incidents
           WHERE status = 'Submitted'
             AND (priority = 'critical' OR is_sos = 1)
             AND created_at <= ?`
        )
        .all(cutoffIso) as Array<{
        id: string;
        incident_number: string;
        reporter_id: string;
        priority: string;
        is_sos: number;
        title: string;
      }>;

      if (staleIncidents.length === 0) return;

      const adminOrResponders = db
        .prepare("SELECT id FROM profiles WHERE role IN ('admin', 'responder') AND account_status = 'active'")
        .all() as Array<{ id: string }>;

      const now = new Date().toISOString();

      for (const inc of staleIncidents) {
        const actorId = adminOrResponders[0]?.id || inc.reporter_id;
        db.transaction(() => {
          db.prepare("UPDATE incidents SET status = 'Escalated', updated_at = ? WHERE id = ?").run(now, inc.id);
          db.prepare(
            `INSERT INTO incident_updates (id, incident_id, updated_by, previous_status, new_status, action_description, internal_note, visibility, created_at)
             VALUES (?, ?, ?, 'Submitted', 'Escalated', ?, ?, 'public', ?)`
          ).run(
            crypto.randomUUID(),
            inc.id,
            actorId,
            `Automatic escalation: Unacknowledged beyond ${thresholdMinutes} minute threshold.`,
            'Automated escalation triggered due to pending responder acknowledgement.',
            now
          );

          for (const staff of adminOrResponders) {
            db.prepare(
              `INSERT INTO notifications (id, incident_id, recipient_id, notification_type, title, message, delivery_status, provider_reference, created_at, delivered_at)
               VALUES (?, ?, ?, 'in_app', ?, ?, 'delivered', 'ws-escalation', ?, ?)`
            ).run(
              crypto.randomUUID(),
              inc.id,
              staff.id,
              `Escalated Emergency: ${inc.incident_number}`,
              `Incident ${inc.incident_number} exceeded ${thresholdMinutes}m without acknowledgement.`,
              now,
              now
            );
          }
        })();

        writeAuditLog(null, 'INCIDENT_AUTO_ESCALATED', 'incident', inc.id, {
          incident_number: inc.incident_number,
          threshold_minutes: thresholdMinutes,
        });

        broadcastIncidentEvent('incident:updated', {
          incidentId: inc.id,
          incidentNumber: inc.incident_number,
          status: 'Escalated',
          reporterId: inc.reporter_id,
        });
      }
    } catch (err) {
      console.error('Escalation check error:', err);
    }
  }, 60000);

  server.on('close', () => {
    clearInterval(heartbeatInterval);
    clearInterval(escalationInterval);
  });
}

export function broadcastIncidentEvent(
  eventType: 'incident:created' | 'incident:updated',
  payload: {
    incidentId: string;
    incidentNumber: string;
    status: string;
    priority?: string;
    isSos?: boolean;
    reporterId: string;
    assignedResponderIds?: string[];
  }
): void {
  const message = JSON.stringify({ type: eventType, payload });
  for (const client of clients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;

    // Strict RBAC delivery: only admins, responders, or the incident's own reporter
    const isAuthorized =
      client.role === 'admin' ||
      client.role === 'responder' ||
      client.userId === payload.reporterId ||
      (payload.assignedResponderIds && payload.assignedResponderIds.includes(client.userId));

    if (isAuthorized) {
      client.ws.send(message);
    }
  }
}

export function sendUserNotification(recipientId: string, payload: Record<string, unknown>): void {
  const message = JSON.stringify({ type: 'notification:new', payload });
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN && client.userId === recipientId) {
      client.ws.send(message);
    }
  }
}
