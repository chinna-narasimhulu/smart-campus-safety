import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  UserCheck,
  XCircle,
} from 'lucide-react';
import type { IncidentPriority, IncidentStatus } from '../types';

export function formatLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

export function StatusIndicator({ status }: { status: IncidentStatus | string }) {
  switch (status) {
    case 'Resolved':
    case 'Closed':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{status}</span>
        </span>
      );
    case 'Escalated':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 whitespace-nowrap">
          <AlertOctagon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{status}</span>
        </span>
      );
    case 'Cancelled':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{status}</span>
        </span>
      );
    case 'In Progress':
    case 'Assigned':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-800 whitespace-nowrap">
          <UserCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{status}</span>
        </span>
      );
    case 'Acknowledged':
    case 'Submitted':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{status}</span>
        </span>
      );
  }
}

export function PriorityIndicator({ priority, isSos }: { priority: IncidentPriority | string; isSos?: boolean | number }) {
  if (priority === 'critical' || isSos) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 whitespace-nowrap">
        <ShieldAlert className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{isSos ? 'SOS · Critical' : 'Critical'}</span>
      </span>
    );
  }
  if (priority === 'high') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 whitespace-nowrap">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>High</span>
      </span>
    );
  }
  if (priority === 'medium') {
    return <span className="text-xs font-medium text-slate-700 whitespace-nowrap">Medium</span>;
  }
  return <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Low</span>;
}
