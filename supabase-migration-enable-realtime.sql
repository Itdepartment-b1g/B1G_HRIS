-- Enable Supabase Realtime for tables used by the leave management and dashboard.
-- Run this migration if realtime subscriptions are not receiving updates.
-- In Supabase Dashboard: Database > Replication > supabase_realtime publication.

-- Leave management
alter publication supabase_realtime add table leave_requests;
alter publication supabase_realtime add table overtime_requests;
alter publication supabase_realtime add table leave_balances;
alter publication supabase_realtime add table leave_type_config;
alter publication supabase_realtime add table leave_type_eligibility;

-- Dashboard
alter publication supabase_realtime add table attendance_records;
alter publication supabase_realtime add table announcements;
