-- Enable Supabase Realtime for Activity module tables.
-- Required for: Activity popup (new announcements/policies/surveys),
-- Activity compliance (acknowledgements/survey completion → time-out unlock).
-- Run this after supabase-migration-enable-realtime.sql.
-- If a table is already in the publication, you may skip that line.

ALTER PUBLICATION supabase_realtime ADD TABLE policies;
ALTER PUBLICATION supabase_realtime ADD TABLE surveys;
ALTER PUBLICATION supabase_realtime ADD TABLE announcement_acknowledgements;
ALTER PUBLICATION supabase_realtime ADD TABLE policy_acknowledgements;
ALTER PUBLICATION supabase_realtime ADD TABLE survey_responses;
ALTER PUBLICATION supabase_realtime ADD TABLE survey_completions;
