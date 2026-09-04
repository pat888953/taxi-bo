from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote
from datetime import datetime
import json
import math
import sqlite3
import sys
import uuid


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "taxi_bo.db"
BACKUP_DIR = ROOT / "route_repair_backups"


def connect_db():
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def parse_json(value, fallback):
    try:
        parsed = json.loads(value or "")
        return parsed if isinstance(parsed, type(fallback)) else fallback
    except (TypeError, json.JSONDecodeError):
        return fallback


def route_label(row):
    name = row["name"] or "Untitled route"
    destination = row["destination"] or "Unknown destination"
    points = parse_json(row["recorded_track_points"], [])
    return f"{name} -> {destination} ({len(points)} GPS points)"


def list_routes():
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT id, name, destination, recorded_track_points, updated_at, position
            FROM routes
            WHERE recorded_track_points IS NOT NULL AND recorded_track_points != '[]'
            ORDER BY updated_at DESC, position ASC
            """
        ).fetchall()
    return [
        {
            "id": row["id"],
            "label": route_label(row),
            "name": row["name"],
            "destination": row["destination"],
            "pointCount": len(parse_json(row["recorded_track_points"], [])),
            "updatedAt": row["updated_at"],
        }
        for row in rows
    ]


def fetch_route(route_id, include_images=False):
    with connect_db() as db:
        route = db.execute("SELECT * FROM routes WHERE id = ?", (route_id,)).fetchone()
        if not route:
            return None

        image_column = "image" if include_images else "'' AS image"
        photos = db.execute(
            f"""
            SELECT id, step, title, instruction, notes, {image_column}, latitude, longitude
            FROM photo_stops
            WHERE route_id = ?
            ORDER BY step ASC
            """,
            (route_id,),
        ).fetchall()

    data = dict(route)
    data["recordedTrackPoints"] = parse_json(data.pop("recorded_track_points"), [])
    data["routeGeometry"] = parse_json(data.pop("route_geometry"), [])
    data["routeSections"] = parse_json(data.pop("route_sections"), [])
    data["photos"] = [dict(photo) for photo in photos]
    return data


def safe_filename(value):
    cleaned = "".join(character if character.isalnum() or character in {"-", "_"} else "_" for character in value)
    return cleaned.strip("_")[:80] or "route"


def backup_route(route):
    BACKUP_DIR.mkdir(exist_ok=True)
    created_at = datetime.now().strftime("%Y%m%d-%H%M%S")
    route_name = safe_filename(route.get("name") or "route")
    backup_path = BACKUP_DIR / f"{created_at}_{route_name}_{route['id'][:8]}.json"
    payload = {
        "kind": "taxibo-route-repair-backup",
        "createdAt": datetime.now().isoformat(timespec="seconds"),
        "sourceRouteId": route["id"],
        "route": route,
    }
    backup_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return backup_path


def haversine_meters(first, second):
    radius = 6371000
    lat1 = math.radians(first[0])
    lat2 = math.radians(second[0])
    dlat = math.radians(second[0] - first[0])
    dlng = math.radians(second[1] - first[1])
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def route_distance(points):
    total = 0
    for previous, current in zip(points, points[1:]):
        total += haversine_meters(
            [float(previous["latitude"]), float(previous["longitude"])],
            [float(current["latitude"]), float(current["longitude"])],
        )
    return total


def parse_anchor(anchor):
    if not anchor:
        return None

    try:
        latitude = float(anchor["latitude"])
        longitude = float(anchor["longitude"])
    except (KeyError, TypeError, ValueError):
        return None

    return {"latitude": latitude, "longitude": longitude}


def repair_points(original_points, start_index, end_index, repair_path, start_anchor=None, end_anchor=None):
    if start_index < 0 or end_index >= len(original_points) or start_index >= end_index:
        raise ValueError("Choose a start point before the end point.")

    cleaned_path = [
        {
            "latitude": float(point["latitude"]),
            "longitude": float(point["longitude"]),
        }
        for point in repair_path
        if point and "latitude" in point and "longitude" in point
    ]

    if not cleaned_path:
        raise ValueError("Draw at least one repair point between the selected start and end.")

    start_point = original_points[start_index]
    end_point = original_points[end_index]
    corrected_start = parse_anchor(start_anchor) or start_point
    corrected_end = parse_anchor(end_anchor) or end_point
    start_timestamp = float(start_point.get("timestamp") or 0)
    end_timestamp = float(end_point.get("timestamp") or 0)
    if end_timestamp <= start_timestamp:
        raise ValueError("The selected GPS points do not have a valid timestamp order.")

    path = [
        {"latitude": float(corrected_start["latitude"]), "longitude": float(corrected_start["longitude"])},
        *cleaned_path,
        {"latitude": float(corrected_end["latitude"]), "longitude": float(corrected_end["longitude"])},
    ]
    start_moved = path[0]["latitude"] != float(start_point["latitude"]) or path[0]["longitude"] != float(start_point["longitude"])
    end_moved = path[-1]["latitude"] != float(end_point["latitude"]) or path[-1]["longitude"] != float(end_point["longitude"])
    segment_lengths = [
        haversine_meters(
            [path[index]["latitude"], path[index]["longitude"]],
            [path[index + 1]["latitude"], path[index + 1]["longitude"]],
        )
        for index in range(len(path) - 1)
    ]
    total_distance = sum(segment_lengths) or 1

    replacement = []
    elapsed_distance = 0
    for index, point in enumerate(path):
        if index > 0:
            elapsed_distance += segment_lengths[index - 1]
        progress = elapsed_distance / total_distance
        timestamp = start_timestamp + (end_timestamp - start_timestamp) * progress
        source = start_point if index == 0 else end_point if index == len(path) - 1 else {}
        anchor_moved = index == 0 and start_moved or index == len(path) - 1 and end_moved
        replacement.append(
            {
                **source,
                "latitude": point["latitude"],
                "longitude": point["longitude"],
                "timestamp": timestamp,
                "repaired": True if index not in {0, len(path) - 1} or anchor_moved else bool(source.get("repaired")),
            }
        )

    return original_points[:start_index] + replacement + original_points[end_index + 1:]


def save_repaired_copy(route_id, start_index, end_index, repair_path, start_anchor=None, end_anchor=None):
    route = fetch_route(route_id, include_images=True)
    if not route:
        raise ValueError("Route not found.")

    backup_path = backup_route(route)
    original_points = route["recordedTrackPoints"]
    repaired = repair_points(original_points, start_index, end_index, repair_path, start_anchor, end_anchor)
    repaired_id = str(uuid.uuid4())
    repaired_name = f"{route['name']} - repaired"
    geometry = [[point["latitude"], point["longitude"]] for point in repaired]
    distance = route_distance(repaired)
    notes = (route["notes"] or "").strip()
    notes = f"{notes}\nManual route repair copy from {route_id}: replaced GPS points {start_index} to {end_index}.".strip()

    with connect_db() as db:
        row = db.execute("SELECT COALESCE(MAX(position), -1) + 1 AS position FROM routes").fetchone()
        position = int(row["position"] or 0)
        db.execute(
            """
            INSERT INTO routes (
              id, name, variant, start, via, destination, time_window,
              traffic_pattern, notes, start_latitude, start_longitude,
              destination_latitude, destination_longitude, route_geometry, route_sections,
              recorded_track_points, route_type, route_distance_meters,
              route_duration_seconds, position, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                repaired_id,
                repaired_name,
                route["variant"],
                route["start"],
                route["via"],
                route["destination"],
                route["time_window"],
                route["traffic_pattern"],
                notes,
                route["start_latitude"],
                route["start_longitude"],
                route["destination_latitude"],
                route["destination_longitude"],
                json.dumps(geometry),
                json.dumps(route["routeSections"] or []),
                json.dumps(repaired),
                route["route_type"],
                distance,
                route["route_duration_seconds"],
                position,
            ),
        )

        for photo in route["photos"]:
            db.execute(
                """
                INSERT INTO photo_stops (
                  id, route_id, step, title, instruction, notes, image,
                  latitude, longitude, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    str(uuid.uuid4()),
                    repaired_id,
                    int(photo["step"] or 1),
                    photo["title"],
                    photo["instruction"],
                    photo["notes"],
                    photo["image"],
                    photo["latitude"],
                    photo["longitude"],
                ),
            )

    return {
        "id": repaired_id,
        "name": repaired_name,
        "pointCount": len(repaired),
        "distanceMeters": distance,
        "backupPath": str(backup_path),
    }


HTML = r"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TaxiBo Route Repair</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #07150f; background: #f7faf7; }
    header { padding: 14px 18px; border-bottom: 1px solid #c9d8ce; background: white; }
    h1 { margin: 0; font-size: 22px; }
    .shell { display: grid; grid-template-columns: 360px 1fr; min-height: calc(100vh - 59px); }
    .panel { padding: 14px; border-right: 1px solid #c9d8ce; background: #fff; overflow: auto; }
    label { display: block; margin: 10px 0 6px; font-weight: 700; font-size: 13px; }
    select, input { width: 100%; padding: 10px; border: 1px solid #bccbc0; border-radius: 6px; font-size: 14px; }
    button { padding: 10px 12px; border: 1px solid #b7c8bd; border-radius: 6px; background: #fff; font-weight: 700; cursor: pointer; }
    button.primary { background: #18754f; border-color: #18754f; color: #fff; }
    button.danger { background: #fff7ef; border-color: #d99b47; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    #map, .leaflet-container, .leaflet-grab, .leaflet-dragging .leaflet-grab, .leaflet-interactive { cursor: default !important; }
    .row { display: flex; gap: 8px; margin-top: 10px; }
    .row > * { flex: 1; }
    .hint, .status { color: #4e6258; line-height: 1.45; font-size: 13px; }
    .status { margin-top: 12px; padding: 10px; background: #eef7f1; border: 1px solid #c5d8cc; border-radius: 6px; min-height: 44px; }
    .status.error { background: #fff2e8; border-color: #df9d43; color: #371c00; }
    .readout { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
    .readout div { padding: 9px; border: 1px solid #d6e1da; border-radius: 6px; background: #f9fbf9; }
    .readout span { display: block; color: #5a6c62; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    #map { width: 100%; height: calc(100vh - 59px); }
    .mode { outline: 3px solid #18754f; }
    @media (max-width: 760px) { .shell { grid-template-columns: 1fr; } #map { height: 62vh; } .panel { border-right: 0; border-bottom: 1px solid #c9d8ce; } }
  </style>
</head>
<body>
  <header><h1>TaxiBo Route Repair</h1></header>
  <main class="shell">
    <section class="panel">
      <label for="routeSelect">Recorded route</label>
      <select id="routeSelect"></select>
      <div class="row">
        <button id="loadRoute" class="primary">Load route</button>
        <button id="restoreRepair">Restore original</button>
      </div>
      <p class="hint">Click a last-good point before the missing tunnel/gap, click a first-good point after it, then draw the corrected path on the map.</p>
      <div class="row">
        <button id="pickStart">Pick start</button>
        <button id="pickEnd">Pick end</button>
        <button id="drawPath">Draw path</button>
      </div>
      <div class="row">
        <button id="moveStart">Move start</button>
        <button id="moveEnd">Move end</button>
      </div>
      <div class="row">
        <button id="eraseSegment" class="danger">Eraser</button>
      </div>
      <div class="readout">
        <div><span>Mouse</span><strong id="mouseReadout">--</strong></div>
        <div><span>Repair points</span><strong id="repairCount">0</strong></div>
        <div><span>Start index</span><strong id="startIndex">--</strong></div>
        <div><span>End index</span><strong id="endIndex">--</strong></div>
      </div>
      <label for="copyName">Saved copy name</label>
      <input id="copyName" placeholder="Route name - repaired">
      <div class="row">
        <button id="undoPoint">Undo point</button>
        <button id="saveCopy" class="primary">Save repaired copy</button>
      </div>
      <div id="status" class="status">Load a route to begin.</div>
    </section>
    <div id="map"></div>
  </main>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const routeSelect = document.querySelector("#routeSelect");
    const statusBox = document.querySelector("#status");
    const mouseReadout = document.querySelector("#mouseReadout");
    const repairCount = document.querySelector("#repairCount");
    const startIndexLabel = document.querySelector("#startIndex");
    const endIndexLabel = document.querySelector("#endIndex");
    const copyName = document.querySelector("#copyName");
    const map = L.map("map").setView([22.3193, 114.1694], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }).addTo(map);

    let route = null;
    let mode = "";
    let startIndex = null;
    let endIndex = null;
    let startAnchor = null;
    let endAnchor = null;
    let repairPoints = [];
    let isSegmentErased = false;
    let originalLine = null;
    let selectedLine = null;
    let repairLine = null;
    let markers = [];
    let loadedRouteId = "";

    function setStatus(message, isError = false) {
      statusBox.textContent = message;
      statusBox.className = isError ? "status error" : "status";
    }

    function setMode(nextMode) {
      mode = nextMode;
      document.querySelectorAll("#pickStart,#pickEnd,#drawPath,#moveStart,#moveEnd").forEach((button) => button.classList.remove("mode"));
      if (nextMode) document.querySelector(`#${nextMode}`).classList.add("mode");
    }

    function pointLatLng(point) {
      return [Number(point.latitude), Number(point.longitude)];
    }

    function anchorLatLng(index, anchor) {
      return anchor ? [anchor.latitude, anchor.longitude] : pointLatLng(route.recordedTrackPoints[index]);
    }

    function nearestPointIndex(latlng) {
      if (!route) return null;
      let bestIndex = 0;
      let bestDistance = Infinity;
      route.recordedTrackPoints.forEach((point, index) => {
        const distance = map.distance(latlng, L.latLng(point.latitude, point.longitude));
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      return bestIndex;
    }

    function render() {
      markers.forEach((marker) => marker.remove());
      markers = [];
      if (originalLine) originalLine.remove();
      if (selectedLine) selectedLine.remove();
      if (repairLine) repairLine.remove();

      if (!route) return;
      const original = route.recordedTrackPoints.map(pointLatLng);
      const hasErasedSegment = isSegmentErased && startIndex !== null && endIndex !== null && endIndex > startIndex;
      const visibleOriginalSegments = hasErasedSegment
        ? [original.slice(0, startIndex + 1), original.slice(endIndex)]
        : [original];
      originalLine = L.featureGroup(
        visibleOriginalSegments
          .filter((segment) => segment.length > 1)
          .map((segment) => L.polyline(segment, { color: "#905336", weight: 5, opacity: 0.72 }))
      ).addTo(map);
      if (!hasErasedSegment && startIndex !== null && endIndex !== null && endIndex > startIndex) {
        selectedLine = L.polyline(original.slice(startIndex, endIndex + 1), { color: "#d84b2a", weight: 7, opacity: 0.78 }).addTo(map);
      }
      if (repairPoints.length) {
        const repairPath = [];
        if (startIndex !== null) repairPath.push(anchorLatLng(startIndex, startAnchor));
        repairPath.push(...repairPoints.map((point) => [point.latitude, point.longitude]));
        if (endIndex !== null) repairPath.push(anchorLatLng(endIndex, endAnchor));
        repairLine = L.polyline(repairPath, { color: "#147a54", weight: 6, opacity: 0.9 }).addTo(map);
        repairPoints.forEach((point, index) => {
          markers.push(L.circleMarker([point.latitude, point.longitude], { radius: 5, color: "#147a54", fillColor: "#147a54", fillOpacity: 1 }).bindTooltip(String(index + 1)).addTo(map));
        });
      }
      if (startIndex !== null) markers.push(L.marker(anchorLatLng(startIndex, startAnchor)).bindTooltip(startAnchor ? "Moved repair start" : "Repair start").addTo(map));
      if (endIndex !== null) markers.push(L.marker(anchorLatLng(endIndex, endAnchor)).bindTooltip(endAnchor ? "Moved repair end" : "Repair end").addTo(map));
      startIndexLabel.textContent = startIndex === null ? "--" : startIndex;
      endIndexLabel.textContent = endIndex === null ? "--" : endIndex;
      repairCount.textContent = repairPoints.length;
    }

    async function loadRouteList() {
      const response = await fetch("/api/routes");
      const routes = await response.json();
      routeSelect.innerHTML = routes.map((item) => `<option value="${item.id}">${item.label}</option>`).join("");
      if (!routes.length) setStatus("No recorded routes found in taxi_bo.db.", true);
    }

    async function loadSelectedRoute() {
      const id = routeSelect.value;
      const response = await fetch(`/api/routes/${encodeURIComponent(id)}`);
      route = await response.json();
      loadedRouteId = route.id;
      startIndex = null;
      endIndex = null;
      startAnchor = null;
      endAnchor = null;
      repairPoints = [];
      isSegmentErased = false;
      copyName.value = `${route.name} - repaired`;
      render();
      if (originalLine) map.fitBounds(originalLine.getBounds(), { padding: [24, 24] });
      setStatus(`Loaded ${route.name} with ${route.recordedTrackPoints.length} GPS points.`);
    }

    function restoreOriginalRepair() {
      if (!route) {
        setStatus("Load a route before restoring.", true);
        return;
      }

      startIndex = null;
      endIndex = null;
      startAnchor = null;
      endAnchor = null;
      repairPoints = [];
      isSegmentErased = false;
      setMode("");
      copyName.value = `${route.name} - repaired`;
      routeSelect.value = loadedRouteId;
      render();
      if (originalLine) map.fitBounds(originalLine.getBounds(), { padding: [24, 24] });
      setStatus("Restored the loaded route view. All picked start/end points and drawn repair points were cleared.");
    }

    map.on("mousemove", (event) => {
      mouseReadout.textContent = `${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}`;
    });

    map.on("click", (event) => {
      if (!route) return;
      if (mode === "pickStart") {
        startIndex = nearestPointIndex(event.latlng);
        if (endIndex !== null && startIndex >= endIndex) {
          endIndex = null;
          endAnchor = null;
        }
        startAnchor = null;
        isSegmentErased = false;
        setStatus(`Repair start set to GPS point ${startIndex}.`);
      } else if (mode === "pickEnd") {
        endIndex = nearestPointIndex(event.latlng);
        if (startIndex !== null && endIndex <= startIndex) {
          setStatus("End point must be after the start point.", true);
          return;
        }
        endAnchor = null;
        isSegmentErased = false;
        setStatus(`Repair end set to GPS point ${endIndex}.`);
      } else if (mode === "moveStart") {
        if (startIndex === null) {
          setStatus("Pick start before moving it.", true);
          return;
        }
        startAnchor = { latitude: event.latlng.lat, longitude: event.latlng.lng };
        setStatus(`Repair start moved to ${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}.`);
      } else if (mode === "moveEnd") {
        if (endIndex === null) {
          setStatus("Pick end before moving it.", true);
          return;
        }
        endAnchor = { latitude: event.latlng.lat, longitude: event.latlng.lng };
        setStatus(`Repair end moved to ${event.latlng.lat.toFixed(6)}, ${event.latlng.lng.toFixed(6)}.`);
      } else if (mode === "drawPath") {
        repairPoints.push({ latitude: event.latlng.lat, longitude: event.latlng.lng });
        setStatus(`Added repair point ${repairPoints.length}.`);
      }
      render();
    });

    document.querySelector("#loadRoute").addEventListener("click", loadSelectedRoute);
    document.querySelector("#pickStart").addEventListener("click", () => setMode("pickStart"));
    document.querySelector("#pickEnd").addEventListener("click", () => setMode("pickEnd"));
    document.querySelector("#drawPath").addEventListener("click", () => setMode("drawPath"));
    document.querySelector("#moveStart").addEventListener("click", () => setMode("moveStart"));
    document.querySelector("#moveEnd").addEventListener("click", () => setMode("moveEnd"));
    document.querySelector("#eraseSegment").addEventListener("click", () => {
      if (startIndex === null || endIndex === null || endIndex <= startIndex) {
        setStatus("Pick a start and end point before using Eraser.", true);
        return;
      }

      isSegmentErased = true;
      setMode("");
      render();
      setStatus("Bad original section hidden. Now click Draw path and place the corrected route points.");
    });
    document.querySelector("#undoPoint").addEventListener("click", () => {
      repairPoints.pop();
      render();
      setStatus("Last repair point removed.");
    });
    document.querySelector("#restoreRepair").addEventListener("click", restoreOriginalRepair);
    document.querySelector("#saveCopy").addEventListener("click", async () => {
      try {
        const response = await fetch(`/api/routes/${encodeURIComponent(route.id)}/repair-copy`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startIndex,
            endIndex,
            startAnchor,
            endAnchor,
            repairPath: repairPoints,
            name: copyName.value.trim()
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not save repaired copy.");
        setStatus(`Saved repaired copy: ${result.name}. ${result.pointCount} GPS points. Backup created at ${result.backupPath}.`);
        await loadRouteList();
        routeSelect.value = loadedRouteId;
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    loadRouteList().catch((error) => setStatus(error.message, true));
  </script>
</body>
</html>
"""


class RouteRepairHandler(BaseHTTPRequestHandler):
    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = unquote(self.path.split("?", 1)[0])
        if path == "/":
            body = HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/api/routes":
            self.send_json(list_routes())
            return

        prefix = "/api/routes/"
        if path.startswith(prefix):
            route_id = path[len(prefix):]
            route = fetch_route(route_id)
            if not route:
                self.send_json({"error": "Route not found."}, 404)
                return
            self.send_json(route)
            return

        self.send_json({"error": "Not found."}, 404)

    def do_POST(self):
        path = unquote(self.path.split("?", 1)[0])
        prefix = "/api/routes/"
        suffix = "/repair-copy"
        if not (path.startswith(prefix) and path.endswith(suffix)):
            self.send_json({"error": "Not found."}, 404)
            return

        route_id = path[len(prefix):-len(suffix)]
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            result = save_repaired_copy(
                route_id,
                int(payload.get("startIndex")),
                int(payload.get("endIndex")),
                payload.get("repairPath") or [],
                payload.get("startAnchor"),
                payload.get("endAnchor"),
            )
            if payload.get("name"):
                with connect_db() as db:
                    db.execute("UPDATE routes SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (payload["name"], result["id"]))
                result["name"] = payload["name"]
            self.send_json(result)
        except Exception as error:
            self.send_json({"error": str(error)}, 400)

    def log_message(self, format, *args):
        print(f"{self.address_string()} - {format % args}")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8030
    if not DB_PATH.exists():
        raise SystemExit(f"Cannot find database: {DB_PATH}")
    server = ThreadingHTTPServer(("127.0.0.1", port), RouteRepairHandler)
    print(f"TaxiBo Route Repair Tool: http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
