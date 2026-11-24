-- 002_rls_policies.sql
-- Strict Row Level Security (RLS) policies for every table

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_attachments ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND account_status = 'active';
$$;

-- PROFILES: Users see/update own profile (cannot change role/account_status); Admins manage all
CREATE POLICY "profiles_select_own_or_staff" ON public.profiles
  FOR SELECT USING (
    id = auth.uid() OR public.current_user_role() IN ('admin', 'responder')
  );

CREATE POLICY "profiles_update_own_safe" ON public.profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND account_status = (SELECT account_status FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL USING (public.current_user_role() = 'admin');

-- INCIDENTS: Reporters read/create own; Responders read assigned/emergency; Admins read/manage all
CREATE POLICY "incidents_select_scoped" ON public.incidents
  FOR SELECT USING (
    reporter_id = auth.uid()
    OR public.current_user_role() = 'admin'
    OR (
      public.current_user_role() = 'responder'
      AND (
        is_sos = TRUE
        OR priority = 'critical'
        OR EXISTS (
          SELECT 1 FROM public.incident_assignments ia
          WHERE ia.incident_id = incidents.id AND ia.responder_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "incidents_insert_reporter" ON public.incidents
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

-- INCIDENT LOCATIONS: Strictly inherits incident access scope
CREATE POLICY "locations_select_scoped" ON public.incident_locations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_id)
  );

-- INCIDENT UPDATES: Reporters only see visibility='public'; Staff see all updates
CREATE POLICY "updates_select_scoped" ON public.incident_updates
  FOR SELECT USING (
    (
      visibility = 'public'
      AND EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_id AND i.reporter_id = auth.uid())
    )
    OR public.current_user_role() IN ('responder', 'admin')
  );

-- INCIDENT ASSIGNMENTS: Responders see own assignments; Admins see all
CREATE POLICY "assignments_select_scoped" ON public.incident_assignments
  FOR SELECT USING (
    responder_id = auth.uid() OR public.current_user_role() = 'admin'
  );

-- NOTIFICATIONS: Recipients only see their own notifications
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "notifications_update_read_own" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- AUDIT LOGS: Admin read-only (inserts via server-side Edge Functions / service role)
CREATE POLICY "audit_logs_admin_read" ON public.audit_logs
  FOR SELECT USING (public.current_user_role() = 'admin');

-- ATTACHMENTS: Access inherits parent incident visibility
CREATE POLICY "attachments_select_scoped" ON public.incident_attachments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_id)
  );
