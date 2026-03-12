-- ============================================================
-- B1G HRIS — Migration: Count leave days excluding Sunday only
-- Change: count_working_days now excludes only Sunday (Saturday counts).
-- Safe to re-run.
-- ============================================================

CREATE OR REPLACE FUNCTION public.count_working_days(_start DATE, _end DATE)
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  d DATE := _start;
  cnt INT := 0;
BEGIN
  WHILE d <= _end LOOP
    -- Exclude Sunday only (DOW 0). Saturday is counted.
    IF EXTRACT(DOW FROM d) != 0
       AND NOT EXISTS (SELECT 1 FROM holidays h WHERE h.date = d)
    THEN
      cnt := cnt + 1;
    END IF;
    d := d + 1;
  END LOOP;
  RETURN cnt;
END;
$$;
