-- Run this script to reload the PostgREST schema cache
-- This is needed after creating new functions or tables
-- so that Supabase's API layer can detect them

NOTIFY pgrst, 'reload schema';

-- You should see "Success" after running this
-- Wait about 10 seconds, then try your query again
