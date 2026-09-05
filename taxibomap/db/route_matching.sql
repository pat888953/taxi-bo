ALTER TABLE taxi_routes
  ADD COLUMN IF NOT EXISTS match_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS match_error text DEFAULT '';

CREATE INDEX IF NOT EXISTS taxi_routes_match_status_idx ON taxi_routes (match_status);
