export type UserRole = 'student' | 'faculty' | 'responder' | 'admin';

export type IncidentStatus =
  | 'Submitted'
  | 'Acknowledged'
  | 'Assigned'
  | 'In Progress'
  | 'Resolved'
  | 'Closed'
  | 'Cancelled'
  | 'Escalated';

export type IncidentPriority = 'critical' | 'high' | 'medium' | 'low';

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  department: string;
  role: UserRole;
  responder_specialty: string;
  account_status: 'active' | 'inactive' | 'pending_verification';
  email_verified: number;
  is_test_account?: number;
  created_at?: string;
}

export interface IncidentSummary {
  id: string;
  incident_number: string;
  reporter_id: string;
  is_sos: number;
  category: string;
  title: string;
  description: string;
  priority: IncidentPriority;
  status: IncidentStatus;
  incident_time: string;
  is_test_data: number;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  reporter_name: string;
  reporter_role: UserRole;
  reporter_department: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  location_description: string;
  consent_given: number;
  captured_at: string | null;
  latest_assignment_status: string | null;
  assigned_responder_name: string | null;
  assigned_responder_id: string | null;
}

export interface IncidentLocation {
  id: string;
  incident_id: string;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  location_description: string;
  consent_given: number;
  consent_time: string | null;
  captured_at: string | null;
}

export interface IncidentAssignment {
  id: string;
  incident_id: string;
  responder_id: string;
  assigned_by: string;
  assignment_status: 'pending' | 'accepted' | 'declined' | 'completed';
  decline_reason: string;
  assigned_at: string;
  acknowledged_at: string | null;
  responder_name: string;
  responder_specialty: string;
  responder_phone: string;
  assigned_by_name: string;
}

export interface IncidentUpdate {
  id: string;
  incident_id: string;
  updated_by: string;
  previous_status: string | null;
  new_status: string;
  action_description: string;
  internal_note?: string;
  visibility: 'public' | 'internal';
  created_at: string;
  updated_by_name: string;
  updated_by_role: UserRole;
}

export interface IncidentAttachment {
  id: string;
  original_filename: string;
  file_type: string;
  file_size: number;
  created_at: string;
}

export interface IncidentDetailResponse {
  incident: IncidentSummary & {
    reporter_email: string;
    reporter_phone: string;
    affected_individuals: string;
    reporter_contact: string;
  };
  location: IncidentLocation | null;
  assignments: IncidentAssignment[];
  updates: IncidentUpdate[];
  attachments: IncidentAttachment[];
}

export interface NotificationItem {
  id: string;
  incident_id: string | null;
  notification_type: 'in_app' | 'email' | 'web_push';
  title: string;
  message: string;
  delivery_status: 'pending' | 'delivered' | 'failed' | 'unconfigured';
  provider_reference: string;
  read_at: string | null;
  created_at: string;
  delivered_at: string | null;
}

export interface EmergencyContact {
  id: string;
  name: string;
  department: string;
  phone: string;
  email: string;
  availability: string;
  category: string;
  priority_order: number;
}

export interface IncidentCategory {
  id: string;
  name: string;
  default_priority: IncidentPriority;
  responder_department: string;
  description: string;
}

export interface EmergencyProcedure {
  id: string;
  title: string;
  steps: string[];
}

export interface CampusGuidance {
  campus_name: string;
  campus_center_lat: string;
  campus_center_lng: string;
  allow_student_sos_cancel: string;
  emergency_procedures: EmergencyProcedure[];
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string;
  timestamp: string;
  metadata: string;
}

export interface AdminAnalytics {
  scope: 'real' | 'test' | 'all';
  summary: {
    total: number;
    open_count: number;
    critical_open: number;
    resolved_count: number;
    unassigned_count: number;
    test_records: number;
    real_records: number;
  };
  byCategory: Array<{ category: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  trends: Array<{ day: string; count: number; sos_count: number }>;
  avgAckMinutes: number | null;
  avgResolutionMinutes: number | null;
  workload: Array<{
    id: string;
    full_name: string;
    responder_specialty: string;
    active_count: number;
    completed_count: number;
  }>;
}
