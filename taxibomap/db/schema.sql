CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS hstore;

CREATE TABLE IF NOT EXISTS taxi_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_label text DEFAULT '',
  destination_label text NOT NULL,
  notes text DEFAULT '',
  review_status text NOT NULL DEFAULT 'draft',
  trust_score numeric(5,2) NOT NULL DEFAULT 0,
  distance_meters numeric(12,2) NOT NULL DEFAULT 0,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  raw_line geography(LineString, 4326),
  matched_line geography(LineString, 4326),
  match_status text NOT NULL DEFAULT 'pending',
  match_error text DEFAULT ''
);

CREATE TABLE IF NOT EXISTS taxi_route_points (
  id bigserial PRIMARY KEY,
  route_id uuid NOT NULL REFERENCES taxi_routes(id) ON DELETE CASCADE,
  point_index integer NOT NULL,
  recorded_at timestamptz NOT NULL,
  accuracy_meters numeric(10,2) DEFAULT 0,
  speed_mps numeric(10,2),
  geom geography(Point, 4326) NOT NULL,
  UNIQUE (route_id, point_index)
);

CREATE TABLE IF NOT EXISTS live_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL,
  title text NOT NULL,
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  confidence numeric(5,2) NOT NULL DEFAULT 0,
  reported_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  geom geography(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS taxi_routes_raw_line_gix ON taxi_routes USING gist (raw_line);
CREATE INDEX IF NOT EXISTS taxi_routes_matched_line_gix ON taxi_routes USING gist (matched_line);
CREATE INDEX IF NOT EXISTS taxi_route_points_geom_gix ON taxi_route_points USING gist (geom);
CREATE INDEX IF NOT EXISTS live_reports_geom_gix ON live_reports USING gist (geom);
CREATE INDEX IF NOT EXISTS live_reports_status_idx ON live_reports (status, reported_at DESC);
