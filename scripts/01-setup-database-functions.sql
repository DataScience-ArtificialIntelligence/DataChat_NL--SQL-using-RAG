-- Drop existing functions if they exist to avoid conflicts
-- This allows the script to run successfully even if old versions exist
DROP FUNCTION IF EXISTS execute_raw_sql(TEXT);
DROP FUNCTION IF EXISTS execute_ddl(TEXT);
DROP FUNCTION IF EXISTS get_table_info();

-- Create function to execute raw SQL queries
-- This function allows the application to run dynamic SQL queries safely
CREATE OR REPLACE FUNCTION execute_raw_sql(sql_query TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Execute the query and return results as JSON
  EXECUTE format('SELECT json_agg(t) FROM (%s) t', sql_query) INTO result;
  
  -- Return empty array if no results
  IF result IS NULL THEN
    result := '[]'::json;
  END IF;
  
  RETURN result;
END;
$$;

-- Create function to execute DDL statements (CREATE, DROP, ALTER)
-- This is separate from execute_raw_sql for better security control
CREATE OR REPLACE FUNCTION execute_ddl(ddl_statement TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Execute the DDL statement
  EXECUTE ddl_statement;
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'DDL execution failed: %', SQLERRM;
END;
$$;

-- Create function to get table information
CREATE OR REPLACE FUNCTION get_table_info()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_object_agg(
    table_name,
    json_build_object(
      'columns', columns,
      'description', 'User uploaded data table'
    )
  ) INTO result
  FROM (
    SELECT 
      table_name,
      array_agg(column_name ORDER BY ordinal_position) as columns
    FROM information_schema.columns 
    WHERE table_schema = 'public'
      AND table_name NOT IN ('spatial_ref_sys')
      AND table_name LIKE 'session_%'
    GROUP BY table_name
  ) t;
  
  -- Return empty object if no tables
  IF result IS NULL THEN
    result := '{}'::json;
  END IF;
  
  RETURN result;
END;
$$;

-- Grant execute permissions to authenticated and anon users
GRANT EXECUTE ON FUNCTION execute_raw_sql(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION execute_ddl(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_table_info() TO authenticated, anon;
