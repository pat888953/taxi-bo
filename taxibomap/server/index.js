import { timingSafeEqual } from 'node:crypto';
import { cueBridge, validPoint, routeFollows } from './navidrive-planner.js';
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = normalize(join(__dirname, ".."));
const appDir = join(rootDir, "app");
const preferredPort = Number(process.env.PORT || 8031);
const databaseUrl = process.env.DATABASE_URL || "postgres://taxibo:taxibo_dev_password@localhost:5432/taxibo";
const valhallaUrl = process.env.VALHALLA_URL || "http://localhost:8002";

const pool = new Pool({ connectionString: databaseUrl });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname === '/healthz') { sendJson(response, 200, {ok:true}); return; }
    if (process.env.NAVIDRIVE_TEST_PASSWORD) {
      const expected = Buffer.from('tester:' + process.env.NAVIDRIVE_TEST_PASSWORD);
      const auth = request.headers.authorization || '';
      const supplied = Buffer.from(auth.startsWith('Basic ') ? auth.slice(6) : '', 'base64');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        response.writeHead(401, {'WWW-Authenticate':'Basic realm="TaxiBo NaviDrive test", charset="UTF-8"', 'Cache-Control':'no-store'});
        response.end('Sign in with your test credentials.'); return;
      }
    }
    if (url.pathname === '/api/navidrive/plan' && request.method === 'POST') {
      await handleNaviPlan(request, response); return;
    }
    if (url.pathname === '/api/health') {
      await handleHealth(response);
      return;
    }

    if (url.pathname === "/api/valhalla/health") {
      await handleValhallaHealth(response);
      return;
    }

    if (url.pathname === "/api/route" && request.method === "POST") {
      await handleCalculateRoute(request, response);
      return;
    }

    if (url.pathname === "/api/map-match" && request.method === "POST") {
      await handleMapMatch(request, response);
      return;
    }

    if (url.pathname === "/api/buildings" && request.method === "GET") {
      await handleListBuildings(url, response);
      return;
    }

    if (url.pathname === "/api/routes" && request.method === "GET") {
      await handleListRoutes(response);
      return;
    }

    if (url.pathname === "/api/routes" && request.method === "POST") {
      await handleCreateRoute(request, response);
      return;
    }

    if (url.pathname.startsWith("/api/routes/") && request.method === "DELETE") {
      await handleDeleteRoute(url.pathname.split("/").at(-1), response);
      return;
    }

    if (url.pathname.match(/^\/api\/routes\/[^/]+\/review$/) && request.method === "PATCH") {
      await handleReviewRoute(url.pathname.split("/").at(-2), request, response);
      return;
    }

    if (url.pathname.match(/^\/api\/routes\/[^/]+\/match$/) && request.method === "POST") {
      await handleMatchSavedRoute(url.pathname.split("/").at(-2), response);
      return;
    }

    if (url.pathname === "/api/reports" && request.method === "GET") {
      await handleListReports(response);
      return;
    }

    if (url.pathname === "/api/reports" && request.method === "POST") {
      await handleCreateReport(request, response);
      return;
    }

    if (url.pathname.startsWith("/api/reports/") && request.method === "DELETE") {
      await handleDeleteReport(url.pathname.split("/").at(-1), response);
      return;
    }

    if (url.pathname.match(/^\/api\/reports\/[^/]+\/confirm$/) && request.method === "PATCH") {
      await handleConfirmReport(url.pathname.split("/").at(-2), response);
      return;
    }

    await serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error" });
  }
});

listen(preferredPort);

function listen(nextPort) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && nextPort < preferredPort + 10) {
      listen(nextPort + 1);
      return;
    }
    throw error;
  });

  server.listen(nextPort, () => {
    console.log(`TaxiBoStreetMap running at http://localhost:${nextPort}`);
  });
}

async function handleHealth(response) {
  try {
    await pool.query("SELECT 1");
    sendJson(response, 200, { ok: true, database: "connected" });
  } catch (error) {
    sendJson(response, 503, { ok: false, database: "unavailable", error: error.message });
  }
}

async function handleValhallaHealth(response) {
  try {
    const result = await fetch(`${valhallaUrl}/status`);
    const text = await result.text();
    sendJson(response, result.ok ? 200 : 503, {
      ok: result.ok,
      valhalla: result.ok ? "connected" : "unavailable",
      statusCode: result.status,
      body: tryParseJson(text)
    });
  } catch (error) {
    sendJson(response, 503, { ok: false, valhalla: "unavailable", error: error.message });
  }
}

async function handleCalculateRoute(request, response) {
  const routeRequest = normalizeValhallaRouteRequest(await readJsonBody(request));
  if (routeRequest.locations.length < 2) {
    sendJson(response, 400, { error: "At least two Hong Kong locations are required." });
    return;
  }

  try {
    const valhallaRequest = {
      locations: routeRequest.locations.map((location) => ({
        lat: location.latitude,
        lon: location.longitude,
        type: "break"
      })),
      costing: routeRequest.costing,
      units: "kilometers",
      directions_type: "maneuvers",
      format: "osrm",
      shape_format: "geojson"
    };

    const result = await fetch(`${valhallaUrl}/route?json=${encodeURIComponent(JSON.stringify(valhallaRequest))}`);
    const payload = await result.json();
    if (!result.ok) {
      sendJson(response, result.status, { error: payload.error || "Valhalla route request failed.", details: payload });
      return;
    }

    sendJson(response, 200, normalizeValhallaRouteResponse(payload));
  } catch (error) {
    sendJson(response, 503, { error: "Valhalla is not available yet.", details: error.message });
  }
}

async function handleMapMatch(request, response) {
  const route = normalizeRoute(await readJsonBody(request));
  if (route.points.length < 2) {
    sendJson(response, 400, { error: "At least two GPS points are required for map matching." });
    return;
  }

  try {
    sendJson(response, 200, await mapMatchRoutePoints(route.points));
  } catch (error) {
    sendJson(response, 503, { error: "Valhalla map matching failed.", details: error.message });
  }
}

async function handleListRoutes(response) {
  const result = await pool.query(`
    SELECT
      r.id,
      r.name,
      r.start_label AS start,
      r.destination_label AS destination,
      r.notes,
      r.review_status AS "reviewStatus",
      r.trust_score AS "trustScore",
      r.distance_meters AS "distanceMeters",
      r.match_status AS "matchStatus",
      r.match_error AS "matchError",
      r.created_at AS "createdAt",
      CASE
        WHEN r.matched_line IS NULL THEN NULL
        ELSE ST_AsGeoJSON(r.matched_line::geometry)::json
      END AS "matchedGeometry",
      COALESCE(
        json_agg(
          json_build_object(
            'latitude', ST_Y(p.geom::geometry),
            'longitude', ST_X(p.geom::geometry),
            'accuracy', p.accuracy_meters,
            'speed', p.speed_mps,
            'recordedAt', p.recorded_at
          )
          ORDER BY p.point_index
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'
      ) AS points
    FROM taxi_routes r
    LEFT JOIN taxi_route_points p ON p.route_id = r.id
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `);

  sendJson(response, 200, result.rows);
}

async function handleListBuildings(url, response) {
  const bbox = parseBbox(url.searchParams.get("bbox"));
  if (!bbox) {
    sendJson(response, 400, { error: "bbox query parameter is required: west,south,east,north" });
    return;
  }

  const result = await pool.query(
    `
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(feature), '[]'::json)
      ) AS geojson
      FROM (
        SELECT json_build_object(
          'type', 'Feature',
          'geometry', ST_AsGeoJSON(ST_Transform(way, 4326))::json,
          'properties', json_build_object(
            'osmId', osm_id,
            'name', name,
            'height', LEAST(220, GREATEST(6,
              COALESCE(
                NULLIF(regexp_replace(tags -> 'height', '[^0-9.]', '', 'g'), '')::numeric,
                NULLIF(regexp_replace(tags -> 'building:levels', '[^0-9.]', '', 'g'), '')::numeric * 3,
                CASE
                  WHEN ST_Area(way) > 9000 THEN 45
                  WHEN ST_Area(way) > 3500 THEN 28
                  ELSE 14
                END
              )
            ))
          )
        ) AS feature
        FROM osm_hk_polygon
        WHERE (building IS NOT NULL OR tags ? 'building')
          AND way && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 4326), 3857)
        ORDER BY ST_Area(way) DESC
        LIMIT 3500
      ) features
    `,
    [bbox.west, bbox.south, bbox.east, bbox.north]
  );

  sendJson(response, 200, result.rows[0].geojson);
}


async function handleCreateRoute(request, response) {
  const route = normalizeRoute(await readJsonBody(request));
  if (!route.name || !route.destination) {
    sendJson(response, 400, { error: "Route name and destination are required." });
    return;
  }
  if (route.points.length < 2) {
    sendJson(response, 400, { error: "At least two GPS points are required." });
    return;
  }

  const client = await pool.connect();
  try {
    const match = await tryMapMatchRoute(route.points);
    await client.query("BEGIN");
    const rawLineWkt = toLineStringWkt(route.points);
    const matchedLineWkt = match.geometry.length >= 2 ? toLineStringWkt(match.geometry) : null;
    const inserted = await client.query(
      `
        INSERT INTO taxi_routes
          (name, start_label, destination_label, notes, distance_meters, raw_line, matched_line, match_status, match_error)
        VALUES
          ($1, $2, $3, $4, $5, ST_GeogFromText($6), CASE WHEN $7::text IS NULL THEN NULL ELSE ST_GeogFromText($7) END, $8, $9)
        RETURNING id, created_at AS "createdAt", match_status AS "matchStatus", match_error AS "matchError"
      `,
      [route.name, route.start, route.destination, route.notes, route.distanceMeters, rawLineWkt, matchedLineWkt, match.status, match.error]
    );

    const routeId = inserted.rows[0].id;
    for (const [index, point] of route.points.entries()) {
      await client.query(
        `
          INSERT INTO taxi_route_points
            (route_id, point_index, recorded_at, accuracy_meters, speed_mps, geom)
          VALUES
            ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography)
        `,
        [routeId, index, point.recordedAt, point.accuracy, point.speed, point.longitude, point.latitude]
      );
    }

    await client.query("COMMIT");
    sendJson(response, 201, {
      ...route,
      id: routeId,
      createdAt: inserted.rows[0].createdAt,
      matchStatus: inserted.rows[0].matchStatus,
      matchError: inserted.rows[0].matchError,
      matchedPoints: match.geometry
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function handleMatchSavedRoute(routeId, response) {
  const result = await pool.query(
    `
      SELECT
        json_agg(
          json_build_object(
            'latitude', ST_Y(p.geom::geometry),
            'longitude', ST_X(p.geom::geometry),
            'accuracy', p.accuracy_meters,
            'speed', p.speed_mps,
            'recordedAt', p.recorded_at
          )
          ORDER BY p.point_index
        ) AS points
      FROM taxi_route_points p
      WHERE p.route_id = $1
    `,
    [routeId]
  );

  const points = result.rows[0]?.points || [];
  if (points.length < 2) {
    sendJson(response, 400, { error: "Saved route does not have enough GPS points to match." });
    return;
  }

  const match = await tryMapMatchRoute(points);
  const matchedLineWkt = match.geometry.length >= 2 ? toLineStringWkt(match.geometry) : null;
  const update = await pool.query(
    `
      UPDATE taxi_routes
      SET matched_line = CASE WHEN $2::text IS NULL THEN NULL ELSE ST_GeogFromText($2) END,
          match_status = $3,
          match_error = $4,
          updated_at = now()
      WHERE id = $1
      RETURNING id, match_status AS "matchStatus", match_error AS "matchError"
    `,
    [routeId, matchedLineWkt, match.status, match.error]
  );

  sendJson(response, update.rowCount ? 200 : 404, {
    ...(update.rows[0] || { error: "Route not found." }),
    matchedPoints: match.geometry
  });
}

async function handleDeleteRoute(routeId, response) {
  const result = await pool.query("DELETE FROM taxi_routes WHERE id = $1", [routeId]);
  sendJson(response, result.rowCount ? 200 : 404, { deleted: result.rowCount > 0 });
}

async function handleReviewRoute(routeId, request, response) {
  const review = normalizeReview(await readJsonBody(request));
  const result = await pool.query(
    `
      UPDATE taxi_routes
      SET review_status = $2,
          trust_score = $3,
          updated_at = now()
      WHERE id = $1
      RETURNING id, review_status AS "reviewStatus", trust_score AS "trustScore"
    `,
    [routeId, review.reviewStatus, review.trustScore]
  );

  sendJson(response, result.rowCount ? 200 : 404, result.rows[0] || { error: "Route not found." });
}

async function handleListReports(response) {
  const result = await pool.query(`
    SELECT
      id,
      report_type AS "reportType",
      title,
      notes,
      status,
      confidence,
      reported_at AS "reportedAt",
      expires_at AS "expiresAt",
      ST_Y(geom::geometry) AS latitude,
      ST_X(geom::geometry) AS longitude
    FROM live_reports
    WHERE status = 'active'
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY reported_at DESC
    LIMIT 500
  `);

  sendJson(response, 200, result.rows.map(normalizeReport));
}

async function handleCreateReport(request, response) {
  const report = normalizeReport(await readJsonBody(request));
  if (!report.reportType || !report.title) {
    sendJson(response, 400, { error: "Report type and title are required." });
    return;
  }
  if (!isInsideHongKong(report)) {
    sendJson(response, 400, { error: "Report location must be inside Hong Kong." });
    return;
  }

  const result = await pool.query(
    `
      INSERT INTO live_reports
        (report_type, title, notes, confidence, expires_at, geom)
      VALUES
        ($1, $2, $3, $4, now() + interval '2 hours', ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography)
      RETURNING
        id,
        report_type AS "reportType",
        title,
        notes,
        status,
        confidence,
        reported_at AS "reportedAt",
        expires_at AS "expiresAt",
        ST_Y(geom::geometry) AS latitude,
        ST_X(geom::geometry) AS longitude
    `,
    [report.reportType, report.title, report.notes, report.confidence, report.longitude, report.latitude]
  );

  sendJson(response, 201, normalizeReport(result.rows[0]));
}

async function handleDeleteReport(reportId, response) {
  const result = await pool.query(
    "UPDATE live_reports SET status = 'cleared' WHERE id = $1",
    [reportId]
  );
  sendJson(response, result.rowCount ? 200 : 404, { deleted: result.rowCount > 0 });
}

async function handleConfirmReport(reportId, response) {
  const result = await pool.query(
    `
      UPDATE live_reports
      SET confidence = LEAST(confidence + 10, 100),
          expires_at = GREATEST(COALESCE(expires_at, now()), now() + interval '2 hours')
      WHERE id = $1
      RETURNING
        id,
        report_type AS "reportType",
        title,
        notes,
        status,
        confidence,
        reported_at AS "reportedAt",
        expires_at AS "expiresAt",
        ST_Y(geom::geometry) AS latitude,
        ST_X(geom::geometry) AS longitude
    `,
    [reportId]
  );

  sendJson(response, result.rowCount ? 200 : 404, result.rowCount ? normalizeReport(result.rows[0]) : { error: "Report not found." });
}

async function serveStatic(pathname, response) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = normalize(join(appDir, safePath));
  if (!filePath.startsWith(appDir)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    await readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    createReadStream(filePath).pipe(response);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 5_000_000) {
      throw new Error("Request body is too large.");
    }
  }
  return body ? JSON.parse(body) : {};
}

function normalizeRoute(route) {
  const points = Array.isArray(route.points)
    ? route.points
        .map((point) => ({
          latitude: Number(point.latitude),
          longitude: Number(point.longitude),
          accuracy: Number(point.accuracy || 0),
          speed: Number.isFinite(Number(point.speed)) ? Number(point.speed) : null,
          recordedAt: new Date(point.recordedAt || Date.now()).toISOString()
        }))
        .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && isInsideHongKong(point))
    : [];

  return {
    id: typeof route.id === "string" && route.id ? route.id : crypto.randomUUID(),
    name: String(route.name || "").trim(),
    start: String(route.start || "").trim(),
    destination: String(route.destination || "").trim(),
    notes: String(route.notes || "").trim(),
    createdAt: String(route.createdAt || new Date().toISOString()),
    reviewStatus: String(route.reviewStatus || "draft"),
    trustScore: Number(route.trustScore || 0),
    matchStatus: String(route.matchStatus || "pending"),
    matchError: String(route.matchError || ""),
    matchedPoints: normalizeGeometryPoints(route.matchedPoints || route.matchedGeometry),
    points,
    distanceMeters: totalDistance(points)
  };
}

function parseBbox(value) {
  const parts = String(value || "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  const [west, south, east, north] = parts;
  if (west >= east || south >= north) {
    return null;
  }
  return { west, south, east, north };
}

function normalizeReview(review) {
  const allowedStatuses = new Set(["draft", "trusted", "rejected"]);
  const reviewStatus = allowedStatuses.has(review.reviewStatus) ? review.reviewStatus : "draft";
  const trustScore = Math.max(0, Math.min(100, Number(review.trustScore || 0)));
  return { reviewStatus, trustScore };
}

function normalizeReport(report) {
  return {
    id: typeof report.id === "string" && report.id ? report.id : crypto.randomUUID(),
    reportType: String(report.reportType || "").trim(),
    title: String(report.title || "").trim(),
    notes: String(report.notes || "").trim(),
    status: String(report.status || "active"),
    confidence: Math.max(0, Math.min(100, Number(report.confidence || 50))),
    latitude: Number(report.latitude),
    longitude: Number(report.longitude),
    reportedAt: String(report.reportedAt || new Date().toISOString()),
    expiresAt: report.expiresAt ? String(report.expiresAt) : null
  };
}

function normalizeValhallaRouteRequest(routeRequest) {
  const allowedCosting = new Set(["taxi", "auto", "bus", "truck"]);
  const locations = Array.isArray(routeRequest.locations)
    ? routeRequest.locations
        .map((location) => ({
          latitude: Number(location.latitude),
          longitude: Number(location.longitude)
        }))
        .filter((location) => Number.isFinite(location.latitude) && Number.isFinite(location.longitude) && isInsideHongKong(location))
    : [];

  return {
    costing: allowedCosting.has(routeRequest.costing) ? routeRequest.costing : "taxi",
    locations
  };
}

function normalizeValhallaRouteResponse(payload) {
  const route = payload.routes?.[0];
  const coordinates = route?.geometry?.coordinates || [];
  const summary = route
    ? {
        distanceMeters: route.distance,
        distanceKilometers: Number(route.distance || 0) / 1000,
        durationSeconds: route.duration,
        weight: route.weight
      }
    : {};

  return {
    summary,
    geometry: coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
    maneuvers: route?.legs?.flatMap((leg) => leg.steps || []).map((step) => ({
      instruction: step.maneuver?.instruction || describeValhallaStep(step),
      name: step.name || "",
      type: step.maneuver?.type || "",
      modifier: step.maneuver?.modifier || "",
      bearingAfter: step.maneuver?.bearing_after ?? null,
      bearingBefore: step.maneuver?.bearing_before ?? null,
      distance: step.distance || 0,
      duration: step.duration || 0
    })) || [],
    raw: payload
  };
}

function describeValhallaStep(step) {
  const maneuver = step.maneuver || {};
  const road = step.name ? ` onto ${step.name}` : "";
  const direction = maneuver.modifier ? ` ${maneuver.modifier}` : "";

  switch (maneuver.type) {
    case "depart":
      return step.name ? `Start on ${step.name}` : "Start navigation";
    case "arrive":
      return "Arrive at destination";
    case "turn":
      return `Turn${direction}${road}`;
    case "new name":
      return step.name ? `Continue on ${step.name}` : "Continue";
    case "merge":
      return `Merge${direction}${road}`;
    case "on ramp":
      return `Take the ramp${direction}${road}`;
    case "off ramp":
      return `Take the exit${direction}${road}`;
    case "fork":
      return `Keep${direction}${road}`;
    case "roundabout":
    case "rotary":
      return `Enter the roundabout${road}`;
    case "exit roundabout":
    case "exit rotary":
      return `Exit the roundabout${road}`;
    case "notification":
      return step.name ? `Continue on ${step.name}` : "Continue";
    default:
      return step.name ? `Continue on ${step.name}` : "Continue";
  }
}

async function tryMapMatchRoute(points) {
  try {
    return await mapMatchRoutePoints(points);
  } catch (error) {
    return await fallbackRouteBetweenTraceEnds(points, error);
  }
}

async function mapMatchRoutePoints(points) {
  const valhallaRequest = {
    shape: points.map((point) => ({
      lat: point.latitude,
      lon: point.longitude,
      time: Math.floor(new Date(point.recordedAt || Date.now()).getTime() / 1000),
      accuracy: Math.max(5, Number(point.accuracy || 15))
    })),
    costing: "taxi",
    shape_match: "map_snap",
    units: "kilometers",
    directions_type: "maneuvers",
    format: "osrm",
    shape_format: "geojson"
  };

  const result = await fetch(`${valhallaUrl}/trace_route?json=${encodeURIComponent(JSON.stringify(valhallaRequest))}`);
  const payload = await result.json();
  if (!result.ok) {
    throw new Error(payload.error || payload.message || "Valhalla trace_route request failed.");
  }

  const normalized = normalizeValhallaRouteResponse(payload);
  if (normalized.geometry.length < 2) {
    throw new Error("Valhalla returned no matched geometry.");
  }

  return {
    status: "matched",
    error: "",
    geometry: normalized.geometry,
    maneuvers: normalized.maneuvers,
    summary: normalized.summary,
    raw: payload
  };
}

async function fallbackRouteBetweenTraceEnds(points, originalError) {
  try {
    const first = points[0];
    const last = points[points.length - 1];
    const routeRequest = {
      locations: [
        { lat: first.latitude, lon: first.longitude, type: "break" },
        { lat: last.latitude, lon: last.longitude, type: "break" }
      ],
      costing: "taxi",
      units: "kilometers",
      directions_type: "maneuvers",
      format: "osrm",
      shape_format: "geojson"
    };

    const result = await fetch(`${valhallaUrl}/route?json=${encodeURIComponent(JSON.stringify(routeRequest))}`);
    const payload = await result.json();
    if (!result.ok) {
      throw new Error(payload.error || payload.message || "Valhalla fallback route failed.");
    }

    const normalized = normalizeValhallaRouteResponse(payload);
    if (normalized.geometry.length < 2) {
      throw new Error("Valhalla fallback route returned no geometry.");
    }

    return {
      status: "matched",
      error: `Trace matching fallback: ${originalError.message || "trace_route failed"}`,
      geometry: normalized.geometry,
      maneuvers: normalized.maneuvers,
      summary: normalized.summary,
      raw: payload
    };
  } catch (fallbackError) {
    return {
      status: "failed",
      error: `${originalError.message || "Valhalla map matching failed."} Fallback also failed: ${fallbackError.message}`,
      geometry: []
    };
  }
}

function normalizeGeometryPoints(value) {
  if (Array.isArray(value)) {
    return value
      .map((point) => ({
        latitude: Number(point.latitude),
        longitude: Number(point.longitude)
      }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  }

  if (value?.type === "LineString" && Array.isArray(value.coordinates)) {
    return value.coordinates
      .map(([longitude, latitude]) => ({ latitude: Number(latitude), longitude: Number(longitude) }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  }

  return [];
}

function toLineStringWkt(points) {
  return `LINESTRING(${points.map((point) => `${point.longitude} ${point.latitude}`).join(",")})`;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isInsideHongKong(point) {
  return point.latitude >= 22.13 &&
    point.latitude <= 22.58 &&
    point.longitude >= 113.80 &&
    point.longitude <= 114.45;
}

function totalDistance(points) {
  let meters = 0;
  for (let index = 1; index < points.length; index += 1) {
    meters += distanceMeters(points[index - 1], points[index]);
  }
  return meters;
}

function distanceMeters(first, second) {
  const earthRadius = 6371000;
  const lat1 = first.latitude * Math.PI / 180;
  const lat2 = second.latitude * Math.PI / 180;
  const deltaLat = (second.latitude - first.latitude) * Math.PI / 180;
  const deltaLng = (second.longitude - first.longitude) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function handleNaviPlan(request, response) {
 try {
  const input = await readJsonBody(request);
  async function resolve(value) {
   if(validPoint(value)) return value;
   if(typeof value !== 'string' || !value.trim() || value.length>200) throw Error('Enter a Hong Kong location.');
   const parts=value.trim().split(',').map(Number);
   if(parts.length===2 && validPoint({latitude:parts[0],longitude:parts[1]})) return {latitude:parts[0],longitude:parts[1],label:value};
   return cueBridge({action:'geocode',query:value.trim()});
  }
  const start=await resolve(input.start), destination=await resolve(input.destination);
  if(!validPoint(start)||!validPoint(destination)) throw Error('Locations must be inside Hong Kong.');
  if(Math.hypot(start.latitude-destination.latitude,start.longitude-destination.longitude)<0.0001) throw Error('Start and destination are too close.');
  async function requestValhalla(endpoint, body) {
   const result=await fetch(valhallaUrl+'/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,costing:'taxi',format:'osrm',shape_format:'geojson',directions_type:'maneuvers'}),signal:AbortSignal.timeout(20000)});
   const data=await result.json();
   if(!result.ok || !data.routes?.[0]?.geometry?.coordinates?.length) throw Error(data.error || 'Valhalla could not calculate this route.');
   return normalizeValhallaRouteResponse(data);
  }
  let route=await requestValhalla('route',{locations:[start,destination].map(p=>({lat:p.latitude,lon:p.longitude,type:'break'}))});
  let engine='Valhalla', explanation='No suitable HDE recorded corridor found.';
  try {
   const {candidate}=await cueBridge({action:'hde',route:{geometry:route.geometry.map(p=>[p.latitude,p.longitude]),distance:route.summary.distanceMeters,duration:route.summary.durationSeconds,cues:[],routeWarnings:[]}});
   if(candidate) {
    const geometry=candidate.geometry;
    if(!Array.isArray(geometry)||geometry.length>15000||!geometry.every(p=>validPoint({latitude:p[0],longitude:p[1]}))) throw Error('HDE candidate geometry is invalid.');
    const checked=await requestValhalla('trace_route',{shape:geometry.map(p=>({lat:p[0],lon:p[1]})),shape_match:'map_snap',trace_options:{search_radius:30,gps_accuracy:10}});
    if(!routeFollows(geometry,checked.geometry.map(p=>[p.latitude,p.longitude])) || checked.summary.distanceMeters>candidate.distance*1.15) throw Error('HDE corridor did not pass road validation.');
    route=checked;engine='Valhalla + HDE';explanation='Recorded corridor selected by HDE and matched by Valhalla.';
   }
  } catch(error) { explanation='HDE unavailable or not validated; using Valhalla. '+error.message; }
  const {raw,...clean}=route;
  sendJson(response,200,{...clean,start,destination,engine,explanation});
 } catch(error) { sendJson(response,400,{error:error.message || 'Route planning failed.'}); }
}
