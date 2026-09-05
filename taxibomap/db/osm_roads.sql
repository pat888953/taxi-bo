CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS hstore;

DROP TABLE IF EXISTS osm_roads;

CREATE TABLE osm_roads AS
SELECT
  osm_id,
  highway,
  name,
  ref,
  oneway,
  bridge,
  tunnel,
  layer,
  tags -> 'maxspeed' AS maxspeed,
  tags -> 'access' AS access,
  tags,
  ST_Transform(way, 4326)::geometry(Geometry, 4326) AS geom,
  now() AS imported_at
FROM osm_hk_line
WHERE highway IS NOT NULL;

ALTER TABLE osm_roads
  ADD COLUMN id bigserial PRIMARY KEY;

CREATE INDEX osm_roads_geom_gix ON osm_roads USING gist (geom);
CREATE INDEX osm_roads_highway_idx ON osm_roads (highway);
CREATE INDEX osm_roads_name_idx ON osm_roads (name);
CREATE INDEX osm_roads_tunnel_idx ON osm_roads (tunnel) WHERE tunnel IS NOT NULL;

ANALYZE osm_roads;
