from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import base64
from io import BytesIO
import json
import math
import os
import re
import sys
import sqlite3
from pathlib import Path
from urllib.parse import urlparse
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import URLError
from uuid import uuid4


ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "taxi_bo.db"
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USING_POSTGRES = bool(DATABASE_URL)
HTTP_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "TaxiBoRouteRecall/1.0 (local app)",
}
MAX_OCR_IMAGE_BYTES = 12 * 1024 * 1024
OCR_ENGINE = None


class DatabaseConnection:
    def __init__(self, connection, postgres=False):
        self.connection = connection
        self.postgres = postgres

    def __enter__(self):
        return self

    def __exit__(self, error_type, error, traceback):
        try:
            if error_type is None:
                self.connection.commit()
            else:
                self.connection.rollback()
        finally:
            self.connection.close()

    def execute(self, query, parameters=()):
        if self.postgres:
            query = query.replace("?", "%s")
        return self.connection.execute(query, parameters)

    def executescript(self, script):
        if not self.postgres:
            return self.connection.executescript(script)

        for statement in script.split(";"):
            statement = statement.strip()
            if statement:
                self.connection.execute(statement)


def connect_db():
    if USING_POSTGRES:
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as error:
            raise RuntimeError(
                "PostgreSQL support is not installed. Run: pip install -r requirements.txt"
            ) from error

        connection = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        return DatabaseConnection(connection, postgres=True)

    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return DatabaseConnection(connection)


def initialize_db():
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS routes (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              variant TEXT NOT NULL,
              start TEXT NOT NULL,
              destination TEXT NOT NULL,
              time_window TEXT NOT NULL DEFAULT '',
              traffic_pattern TEXT NOT NULL DEFAULT '',
              notes TEXT NOT NULL DEFAULT '',
              start_latitude REAL,
              start_longitude REAL,
              destination_latitude REAL,
              destination_longitude REAL,
              route_geometry TEXT NOT NULL DEFAULT '[]',
              route_distance_meters REAL,
              route_duration_seconds REAL,
              position INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS photo_stops (
              id TEXT PRIMARY KEY,
              route_id TEXT NOT NULL,
              step INTEGER NOT NULL,
              title TEXT NOT NULL,
              instruction TEXT NOT NULL DEFAULT '',
              notes TEXT NOT NULL DEFAULT '',
              image TEXT NOT NULL,
              latitude REAL,
              longitude REAL,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_photo_stops_route_step
              ON photo_stops(route_id, step);

            CREATE TABLE IF NOT EXISTS incoming_orders (
              id TEXT PRIMARY KEY,
              pickup TEXT NOT NULL DEFAULT '',
              destination TEXT NOT NULL,
              fare TEXT NOT NULL DEFAULT '',
              waiting_time TEXT NOT NULL DEFAULT '',
              lock_status TEXT NOT NULL DEFAULT 'unknown',
              captured_at TEXT NOT NULL DEFAULT '',
              offer_fingerprint TEXT NOT NULL DEFAULT '',
              raw_text TEXT NOT NULL DEFAULT '',
              source TEXT NOT NULL DEFAULT 'phone',
              consumed_at TEXT,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_incoming_orders_pending
              ON incoming_orders(consumed_at, created_at);

            CREATE TABLE IF NOT EXISTS accepted_trips (
              id TEXT PRIMARY KEY,
              source TEXT NOT NULL DEFAULT '',
              source_order_id TEXT NOT NULL DEFAULT '',
              pickup TEXT NOT NULL,
              destination TEXT NOT NULL,
              accepted_at TEXT NOT NULL DEFAULT '',
              consumed_at TEXT,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_accepted_trips_pending
              ON accepted_trips(consumed_at, created_at);

            CREATE TABLE IF NOT EXISTS route_recordings (
              id TEXT PRIMARY KEY,
              source_route_id TEXT NOT NULL DEFAULT '',
              route_name TEXT NOT NULL DEFAULT '',
              start_label TEXT NOT NULL DEFAULT '',
              destination TEXT NOT NULL DEFAULT '',
              status TEXT NOT NULL DEFAULT 'recording',
              points_json TEXT NOT NULL DEFAULT '[]',
              distance_meters REAL NOT NULL DEFAULT 0,
              duration_seconds REAL NOT NULL DEFAULT 0,
              point_count INTEGER NOT NULL DEFAULT 0,
              start_latitude REAL,
              start_longitude REAL,
              end_latitude REAL,
              end_longitude REAL,
              started_at TEXT NOT NULL,
              ended_at TEXT,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_route_recordings_started
              ON route_recordings(started_at DESC);

            CREATE TABLE IF NOT EXISTS speed_warnings (
              id TEXT PRIMARY KEY,
              label TEXT NOT NULL,
              latitude REAL NOT NULL,
              longitude REAL NOT NULL,
              speed_limit_mph REAL NOT NULL,
              radius_meters REAL NOT NULL DEFAULT 600,
              created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_speed_warnings_location
              ON speed_warnings(latitude, longitude);
            """
        )
        ensure_route_columns(db)
        ensure_incoming_order_columns(db)


def ensure_route_columns(db):
    if db.postgres:
        rows = db.execute(
            """
            SELECT column_name AS name
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'routes'
            """
        ).fetchall()
    else:
        rows = db.execute("PRAGMA table_info(routes)").fetchall()

    existing = {row["name"] for row in rows}
    columns = {
        "start_latitude": "REAL",
        "start_longitude": "REAL",
        "destination_latitude": "REAL",
        "destination_longitude": "REAL",
        "route_geometry": "TEXT NOT NULL DEFAULT '[]'",
        "route_distance_meters": "REAL",
        "route_duration_seconds": "REAL",
    }

    for name, definition in columns.items():
        if name not in existing:
            db.execute(f"ALTER TABLE routes ADD COLUMN {name} {definition}")


def ensure_incoming_order_columns(db):
    if db.postgres:
        rows = db.execute(
            """
            SELECT column_name AS name FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'incoming_orders'
            """
        ).fetchall()
    else:
        rows = db.execute("PRAGMA table_info(incoming_orders)").fetchall()

    existing = {row["name"] for row in rows}
    columns = {
        "pickup": "TEXT NOT NULL DEFAULT ''",
        "fare": "TEXT NOT NULL DEFAULT ''",
        "waiting_time": "TEXT NOT NULL DEFAULT ''",
        "lock_status": "TEXT NOT NULL DEFAULT 'unknown'",
        "captured_at": "TEXT NOT NULL DEFAULT ''",
        "offer_fingerprint": "TEXT NOT NULL DEFAULT ''",
    }
    for name, definition in columns.items():
        if name not in existing:
            db.execute(f"ALTER TABLE incoming_orders ADD COLUMN {name} {definition}")


def fetch_routes():
    with connect_db() as db:
        route_rows = db.execute(
            """
            SELECT
              id, name, variant, start, destination, time_window, traffic_pattern, notes,
              start_latitude, start_longitude, destination_latitude, destination_longitude,
              route_geometry, route_distance_meters, route_duration_seconds
            FROM routes
            ORDER BY position ASC, updated_at DESC
            """
        ).fetchall()
        photo_rows = db.execute(
            """
            SELECT id, route_id, step, title, instruction, notes, image, latitude, longitude
            FROM photo_stops
            ORDER BY step ASC, created_at ASC
            """
        ).fetchall()

    photos_by_route = {}
    for photo in photo_rows:
        photos_by_route.setdefault(photo["route_id"], []).append(
            {
                "id": photo["id"],
                "step": photo["step"],
                "title": photo["title"],
                "instruction": photo["instruction"],
                "notes": photo["notes"],
                "image": photo["image"],
                "latitude": photo["latitude"],
                "longitude": photo["longitude"],
            }
        )

    return [
        {
            "id": route["id"],
            "name": route["name"],
            "variant": route["variant"],
            "start": route["start"],
            "destination": route["destination"],
            "timeWindow": route["time_window"],
            "trafficPattern": route["traffic_pattern"],
            "notes": route["notes"],
            "startLatitude": route["start_latitude"],
            "startLongitude": route["start_longitude"],
            "destinationLatitude": route["destination_latitude"],
            "destinationLongitude": route["destination_longitude"],
            "routeGeometry": json.loads(route["route_geometry"] or "[]"),
            "routeDistanceMeters": route["route_distance_meters"],
            "routeDurationSeconds": route["route_duration_seconds"],
            "photos": photos_by_route.get(route["id"], []),
        }
        for route in route_rows
    ]


def replace_routes(routes):
    with connect_db() as db:
        db.execute("DELETE FROM photo_stops")
        db.execute("DELETE FROM routes")

        for position, route in enumerate(routes):
            db.execute(
                """
                INSERT INTO routes (
                  id, name, variant, start, destination, time_window,
                  traffic_pattern, notes, start_latitude, start_longitude,
                  destination_latitude, destination_longitude, route_geometry,
                  route_distance_meters, route_duration_seconds, position, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    route.get("id", ""),
                    route.get("name", "Untitled route"),
                    route.get("variant", "Standard"),
                    route.get("start", ""),
                    route.get("destination", ""),
                    route.get("timeWindow", ""),
                    route.get("trafficPattern", ""),
                    route.get("notes", ""),
                    route.get("startLatitude"),
                    route.get("startLongitude"),
                    route.get("destinationLatitude"),
                    route.get("destinationLongitude"),
                    json.dumps(route.get("routeGeometry") or []),
                    route.get("routeDistanceMeters"),
                    route.get("routeDurationSeconds"),
                    position,
                ),
            )

            for photo in route.get("photos", []):
                db.execute(
                    """
                    INSERT INTO photo_stops (
                      id, route_id, step, title, instruction, notes,
                      image, latitude, longitude, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (
                        photo.get("id", ""),
                        route.get("id", ""),
                        int(photo.get("step") or 1),
                        photo.get("title", "Untitled stop"),
                        photo.get("instruction", ""),
                        photo.get("notes", ""),
                        photo.get("image", ""),
                        photo.get("latitude"),
                        photo.get("longitude"),
                    ),
                )


def create_incoming_order(payload):
    destination = str(payload.get("destination", "")).strip()

    if not destination:
        raise ValueError("Destination is required.")

    order_id = str(uuid4())

    with connect_db() as db:
        db.execute(
            """
            INSERT INTO incoming_orders (
              id, pickup, destination, fare, waiting_time, lock_status,
              captured_at, offer_fingerprint, raw_text, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                order_id,
                str(payload.get("pickup", "")).strip(),
                destination,
                str(payload.get("fare", "")).strip(),
                str(payload.get("waitingTime", "")).strip(),
                str(payload.get("lockStatus", "unknown")).strip() or "unknown",
                str(payload.get("capturedAt", "")).strip(),
                str(payload.get("fingerprint", "")).strip(),
                str(payload.get("rawText", "")).strip(),
                str(payload.get("source", "phone")).strip() or "phone",
            ),
        )

    return {
        "id": order_id,
        "destination": destination,
        "pickup": str(payload.get("pickup", "")).strip(),
    }


def fetch_pending_orders():
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT id, pickup, destination, fare, waiting_time, lock_status,
                   captured_at, offer_fingerprint, raw_text, source, created_at
            FROM incoming_orders
            WHERE consumed_at IS NULL
            ORDER BY created_at DESC
            LIMIT 20
            """
        ).fetchall()

    return [serialize_incoming_order(row) for row in rows]


def serialize_incoming_order(row):
    return {
        "id": row["id"], "pickup": row["pickup"], "destination": row["destination"],
        "fare": row["fare"], "waitingTime": row["waiting_time"],
        "lockStatus": row["lock_status"], "capturedAt": row["captured_at"],
        "fingerprint": row["offer_fingerprint"], "rawText": row["raw_text"],
        "source": row["source"], "createdAt": row["created_at"],
    }


def verify_incoming_order(payload):
    order_id = str(payload.get("id", "")).strip()
    fingerprint = str(payload.get("fingerprint", "")).strip()
    with connect_db() as db:
        row = db.execute(
            """SELECT id, pickup, destination, fare, waiting_time, lock_status,
                      captured_at, offer_fingerprint, raw_text, source, created_at
               FROM incoming_orders WHERE id = ? AND consumed_at IS NULL""",
            (order_id,),
        ).fetchone()
    if not row:
        return {"valid": False, "reason": "Offer is no longer in the inbox."}
    if not fingerprint or fingerprint != row["offer_fingerprint"]:
        return {"valid": False, "reason": "Offer details changed. Scan FlyTaxi again."}
    return {"valid": True, "order": serialize_incoming_order(row)}


def acknowledge_incoming_order(payload):
    order_id = str(payload.get("id", "")).strip()

    if not order_id:
        raise ValueError("Order id is required.")

    with connect_db() as db:
        db.execute(
            """
            UPDATE incoming_orders
            SET consumed_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (order_id,),
        )

    return {"id": order_id}


def create_accepted_trip(payload):
    pickup = str(payload.get("pickup", "")).strip()
    destination = str(payload.get("destination", "")).strip()
    if not pickup or not destination:
        raise ValueError("Accepted trip pickup and destination are required.")

    trip = {
        "id": str(uuid4()),
        "source": str(payload.get("source", "Fleet app")).strip() or "Fleet app",
        "sourceOrderId": str(payload.get("sourceOrderId", "")).strip(),
        "pickup": pickup,
        "destination": destination,
        "acceptedAt": str(payload.get("acceptedAt", "")).strip(),
    }
    with connect_db() as db:
        db.execute(
            """
            INSERT INTO accepted_trips (
              id, source, source_order_id, pickup, destination, accepted_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                trip["id"], trip["source"], trip["sourceOrderId"],
                trip["pickup"], trip["destination"], trip["acceptedAt"],
            ),
        )
    return trip


def fetch_pending_accepted_trip():
    with connect_db() as db:
        row = db.execute(
            """
            SELECT id, source, source_order_id, pickup, destination, accepted_at, created_at
            FROM accepted_trips
            WHERE consumed_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            """
        ).fetchone()
    if not row:
        return None
    return {
        "id": row["id"], "source": row["source"],
        "sourceOrderId": row["source_order_id"], "pickup": row["pickup"],
        "destination": row["destination"], "acceptedAt": row["accepted_at"],
        "createdAt": row["created_at"],
    }


def acknowledge_accepted_trip(payload):
    trip_id = str(payload.get("id", "")).strip()
    if not trip_id:
        raise ValueError("Accepted trip id is required.")
    with connect_db() as db:
        db.execute(
            "UPDATE accepted_trips SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (trip_id,),
        )
    return {"id": trip_id}


def create_route_recording(payload):
    recording = normalize_route_recording(payload)

    with connect_db() as db:
        db.execute(
            """
            INSERT INTO route_recordings (
              id, source_route_id, route_name, start_label, destination,
              status, points_json, distance_meters, duration_seconds,
              point_count, start_latitude, start_longitude, end_latitude,
              end_longitude, started_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, 'recording', ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """,
            (
                recording["id"],
                recording["sourceRouteId"],
                recording["routeName"],
                recording["startLabel"],
                recording["destination"],
                json.dumps(recording["points"]),
                recording["distanceMeters"],
                recording["durationSeconds"],
                len(recording["points"]),
                recording["startLatitude"],
                recording["startLongitude"],
                recording["endLatitude"],
                recording["endLongitude"],
                recording["startedAt"],
            ),
        )

    return recording_summary(recording, "recording")


def update_route_recording(payload, finish=False):
    recording = normalize_route_recording(payload)
    status = "completed" if finish else "recording"
    ended_at = recording["endedAt"] if finish else None

    with connect_db() as db:
        cursor = db.execute(
            """
            UPDATE route_recordings
            SET points_json = ?, distance_meters = ?, duration_seconds = ?,
                point_count = ?, end_latitude = ?, end_longitude = ?,
                status = ?, ended_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                json.dumps(recording["points"]),
                recording["distanceMeters"],
                recording["durationSeconds"],
                len(recording["points"]),
                recording["endLatitude"],
                recording["endLongitude"],
                status,
                ended_at,
                recording["id"],
            ),
        )

        if cursor.rowcount != 1:
            raise ValueError("Route recording was not found.")

    return recording_summary(recording, status)


def discard_route_recording(payload):
    recording_id = str(payload.get("id", "")).strip()

    if not recording_id:
        raise ValueError("Recording id is required.")

    with connect_db() as db:
        db.execute("DELETE FROM route_recordings WHERE id = ?", (recording_id,))

    return {"id": recording_id, "status": "discarded"}


def fetch_active_route_recording():
    with connect_db() as db:
        row = db.execute(
            """
            SELECT id, source_route_id, route_name, start_label, destination,
                   points_json, distance_meters, duration_seconds, started_at
            FROM route_recordings
            WHERE status = 'recording'
            ORDER BY started_at DESC
            LIMIT 1
            """
        ).fetchone()

    if not row:
        return None

    return {
        "id": row["id"],
        "sourceRouteId": row["source_route_id"],
        "routeName": row["route_name"],
        "startLabel": row["start_label"],
        "destination": row["destination"],
        "points": json.loads(row["points_json"] or "[]"),
        "distanceMeters": row["distance_meters"],
        "durationSeconds": row["duration_seconds"],
        "startedAt": row["started_at"],
        "status": "recording",
    }


def normalize_route_recording(payload):
    recording_id = str(payload.get("id", "")).strip()
    started_at = str(payload.get("startedAt", "")).strip()

    if not recording_id or not started_at:
        raise ValueError("Recording id and start time are required.")

    raw_points = payload.get("points")
    if not isinstance(raw_points, list) or not raw_points:
        raise ValueError("At least one GPS point is required.")
    if len(raw_points) > 25000:
        raise ValueError("This recording contains too many GPS points.")

    points = [normalize_recording_point(point) for point in raw_points]
    first = points[0]
    last = points[-1]

    return {
        "id": recording_id,
        "sourceRouteId": str(payload.get("sourceRouteId", "")).strip(),
        "routeName": str(payload.get("routeName", "")).strip(),
        "startLabel": str(payload.get("startLabel", "")).strip(),
        "destination": str(payload.get("destination", "")).strip(),
        "points": points,
        "distanceMeters": max(0.0, float(payload.get("distanceMeters") or 0)),
        "durationSeconds": max(0.0, float(payload.get("durationSeconds") or 0)),
        "startLatitude": first["latitude"],
        "startLongitude": first["longitude"],
        "endLatitude": last["latitude"],
        "endLongitude": last["longitude"],
        "startedAt": started_at,
        "endedAt": str(payload.get("endedAt", "")).strip() or None,
    }


def normalize_recording_point(point):
    if not isinstance(point, dict):
        raise ValueError("Invalid GPS point.")

    latitude = float(point.get("latitude"))
    longitude = float(point.get("longitude"))
    timestamp = int(point.get("timestamp"))

    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180 or timestamp <= 0:
        raise ValueError("Invalid GPS point coordinates or timestamp.")

    return {
        "latitude": latitude,
        "longitude": longitude,
        "timestamp": timestamp,
        "accuracy": optional_float(point.get("accuracy")),
        "speed": optional_float(point.get("speed")),
        "heading": optional_float(point.get("heading")),
    }


def optional_float(value):
    if value is None or value == "":
        return None
    number = float(value)
    return number if math.isfinite(number) else None


def fetch_speed_warnings():
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT id, label, latitude, longitude, speed_limit_mph, radius_meters
            FROM speed_warnings
            ORDER BY created_at DESC
            """
        ).fetchall()

    return [
        {
            "id": row["id"],
            "label": row["label"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "speedLimitMph": row["speed_limit_mph"],
            "radiusMeters": row["radius_meters"],
        }
        for row in rows
    ]


def create_speed_warning(payload):
    label = str(payload.get("label", "Speed awareness point")).strip()[:120] or "Speed awareness point"
    latitude = float(payload.get("latitude"))
    longitude = float(payload.get("longitude"))
    speed_limit = float(payload.get("speedLimitMph"))
    radius = float(payload.get("radiusMeters") or 600)

    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError("Invalid warning coordinates.")
    if not 5 <= speed_limit <= 100:
        raise ValueError("Speed limit must be between 5 and 100 mph.")
    if not 100 <= radius <= 3000:
        raise ValueError("Warning distance must be between 100 and 3000 meters.")

    warning = {
        "id": str(uuid4()),
        "label": label,
        "latitude": latitude,
        "longitude": longitude,
        "speedLimitMph": speed_limit,
        "radiusMeters": radius,
    }

    with connect_db() as db:
        db.execute(
            """
            INSERT INTO speed_warnings (
              id, label, latitude, longitude, speed_limit_mph, radius_meters
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                warning["id"], warning["label"], warning["latitude"],
                warning["longitude"], warning["speedLimitMph"], warning["radiusMeters"],
            ),
        )

    return warning


def delete_speed_warning(payload):
    warning_id = str(payload.get("id", "")).strip()
    if not warning_id:
        raise ValueError("Warning id is required.")

    with connect_db() as db:
        db.execute("DELETE FROM speed_warnings WHERE id = ?", (warning_id,))

    return {"id": warning_id}


def recording_summary(recording, status):
    return {
        "id": recording["id"],
        "status": status,
        "pointCount": len(recording["points"]),
        "distanceMeters": recording["distanceMeters"],
        "durationSeconds": recording["durationSeconds"],
    }


def recognize_order_image(payload):
    image_data = str(payload.get("image", ""))

    if not image_data:
        raise ValueError("Screenshot image is required.")

    encoded = image_data.split(",", 1)[1] if "," in image_data else image_data

    try:
        image_bytes = base64.b64decode(encoded, validate=True)
    except ValueError as error:
        raise ValueError("The screenshot data is invalid.") from error

    if not image_bytes or len(image_bytes) > MAX_OCR_IMAGE_BYTES:
        raise ValueError("Screenshot must be smaller than 12 MB.")

    try:
        import numpy as np
        from PIL import Image, ImageOps
        from rapidocr_onnxruntime import RapidOCR
    except ImportError as error:
        raise RuntimeError(
            "Server OCR is not installed. Run: python -m pip install rapidocr-onnxruntime==1.4.4"
        ) from error

    try:
        image = ImageOps.exif_transpose(Image.open(BytesIO(image_bytes))).convert("RGB")
        image.thumbnail((2200, 4000))
    except Exception as error:
        raise ValueError("Could not open this screenshot image.") from error

    global OCR_ENGINE
    if OCR_ENGINE is None:
        OCR_ENGINE = RapidOCR()

    result, _ = OCR_ENGINE(np.asarray(image))
    detections = result or []
    lines = [str(item[1]).strip() for item in detections if len(item) >= 3 and str(item[1]).strip()]
    scores = [float(item[2]) for item in detections if len(item) >= 3]
    text = "\n".join(lines)

    if not lines:
        raise ValueError("No readable text was found in this screenshot.")

    return {
        "text": text,
        "lines": lines,
        "destination": extract_order_destination(lines),
        "confidence": sum(scores) / len(scores) if scores else None,
    }


def extract_order_destination(lines):
    address_words = re.compile(
        r"\b(rd|road|st|street|ave|avenue|blvd|boulevard|dr|drive|ln|lane|ct|court|"
        r"way|pkwy|parkway|hwy|highway|chapel hill|carrboro|durham|raleigh|graham|"
        r"nc|north carolina|hong kong)\b",
        re.IGNORECASE,
    )
    noise_words = re.compile(
        r"\b(accept|restaurant|pickup|delivery|total|minute|minutes|min|mile|miles|"
        r"guarantee|guaranteed)\b|外送|獨享|接受|保證|分鐘|英里",
        re.IGNORECASE,
    )
    clean_lines = [normalize_ocr_line(line) for line in lines if str(line).strip()]
    candidates = []

    for index, line in enumerate(clean_lines):
        if not address_words.search(line) or noise_words.search(line):
            continue

        previous = clean_lines[index - 1] if index else ""
        if previous and address_words.search(previous) and not noise_words.search(previous):
            line = f"{previous} {line}"

        candidates.append(clean_order_address(line))

    return candidates[-1] if candidates else ""


def clean_order_address(address):
    address = re.sub(r"^[\s\-:|]+", "", address)
    address = re.sub(r"\s*,\s*", ", ", address)
    address = re.sub(r"\s*&\s*", " & ", address)
    return re.sub(r"\s+", " ", address).strip()


def normalize_ocr_line(line):
    line = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", str(line))
    line = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", line)
    line = re.sub(r"\s*&\s*", " & ", line)
    line = re.sub(r"\s*,\s*", ", ", line)
    return re.sub(r"\s+", " ", line).strip()


def generate_route(payload):
    start_text = str(payload.get("start") or "").strip()
    destination_text = str(payload.get("destination") or "").strip()
    current_position = payload.get("currentPosition") or {}

    if not destination_text:
        raise ValueError("Enter a destination before generating the route.")

    if start_text:
        start = geocode_place(start_text)
        start_label = start["label"]
    else:
        latitude = current_position.get("latitude")
        longitude = current_position.get("longitude")

        if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
            raise ValueError("Enter a start address or allow current-location access.")

        start = {
            "latitude": float(latitude),
            "longitude": float(longitude),
            "label": "Current location",
        }
        start_label = "Current location"

    destination = geocode_place(destination_text)
    road_route = fetch_road_route(start, destination)

    return {
        "start": {
            "latitude": start["latitude"],
            "longitude": start["longitude"],
        },
        "destination": {
            "latitude": destination["latitude"],
            "longitude": destination["longitude"],
        },
        "startLabel": start_label,
        "destinationLabel": destination["label"],
        "geometry": road_route["geometry"],
        "distance": road_route["distance"],
        "duration": road_route["duration"],
        "cues": road_route["cues"],
    }


def generate_cues(payload):
    fallback_geometry = normalize_geometry(payload.get("geometry"))

    try:
        start = normalize_point(payload.get("start"), "start")
        destination = normalize_point(payload.get("destination"), "destination")
        road_route = fetch_road_route(start, destination)
    except Exception:
        if not fallback_geometry:
            raise

        road_route = {
            "geometry": fallback_geometry,
            "distance": None,
            "duration": None,
            "cues": generate_geometry_cues(fallback_geometry),
        }

    return {
        "geometry": road_route["geometry"],
        "distance": road_route["distance"],
        "duration": road_route["duration"],
        "cues": road_route["cues"],
    }


def prepare_route(payload):
    generated = generate_route(payload)
    matched_cues = match_saved_photo_cues(generated["cues"])
    generated["cues"] = matched_cues
    generated["matchedCueCount"] = sum(1 for cue in matched_cues if cue.get("matchedPhoto"))
    generated["cueCount"] = len(matched_cues)
    return generated


def match_saved_photo_cues(cues, radius_meters=80):
    saved_cues = fetch_located_photo_stops()
    matched = []

    for cue in cues:
        cue_latitude = cue.get("latitude")
        cue_longitude = cue.get("longitude")
        best = None

        if isinstance(cue_latitude, (int, float)) and isinstance(cue_longitude, (int, float)):
            for saved in saved_cues:
                distance = haversine_distance(
                    cue_latitude,
                    cue_longitude,
                    saved["latitude"],
                    saved["longitude"],
                )

                if distance <= radius_meters and (best is None or distance < best["distance"]):
                    best = {
                        "distance": distance,
                        "photo": saved,
                    }

        if best:
            photo = best["photo"]
            matched.append(
                {
                    **cue,
                    "title": photo["title"] or cue.get("title", ""),
                    "instruction": photo["instruction"] or cue.get("instruction", ""),
                    "notes": photo["notes"] or cue.get("notes", ""),
                    "image": photo["image"],
                    "matchedPhoto": True,
                    "matchDistanceMeters": round(best["distance"], 1),
                    "sourceRouteId": photo["route_id"],
                    "sourceRouteName": photo["route_name"],
                    "sourcePhotoId": photo["id"],
                }
            )
        else:
            matched.append(
                {
                    **cue,
                    "matchedPhoto": False,
                    "matchDistanceMeters": None,
                }
            )

    return matched


def fetch_located_photo_stops():
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT
              photo_stops.id, photo_stops.route_id, routes.name AS route_name,
              photo_stops.step, photo_stops.title, photo_stops.instruction,
              photo_stops.notes, photo_stops.image, photo_stops.latitude,
              photo_stops.longitude
            FROM photo_stops
            JOIN routes ON routes.id = photo_stops.route_id
            WHERE photo_stops.latitude IS NOT NULL
              AND photo_stops.longitude IS NOT NULL
              AND photo_stops.image IS NOT NULL
              AND photo_stops.image != ''
            """
        ).fetchall()

    return [
        {
            "id": row["id"],
            "route_id": row["route_id"],
            "route_name": row["route_name"],
            "step": row["step"],
            "title": row["title"],
            "instruction": row["instruction"],
            "notes": row["notes"],
            "image": row["image"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
        }
        for row in rows
    ]


def haversine_distance(first_latitude, first_longitude, second_latitude, second_longitude):
    earth_radius = 6371000
    lat1 = math.radians(first_latitude)
    lat2 = math.radians(second_latitude)
    delta_lat = math.radians(second_latitude - first_latitude)
    delta_lng = math.radians(second_longitude - first_longitude)
    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    )

    return earth_radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def normalize_point(point, label):
    if not isinstance(point, dict):
        raise ValueError(f"Missing {label} coordinates.")

    latitude = point.get("latitude")
    longitude = point.get("longitude")

    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        raise ValueError(f"Missing {label} coordinates.")

    return {
        "latitude": float(latitude),
        "longitude": float(longitude),
    }


def normalize_geometry(geometry):
    if not isinstance(geometry, list):
        return []

    normalized = []

    for point in geometry:
        if not isinstance(point, list) or len(point) < 2:
            continue

        latitude, longitude = point[0], point[1]

        if isinstance(latitude, (int, float)) and isinstance(longitude, (int, float)):
            normalized.append([float(latitude), float(longitude)])

    return normalized


def geocode_place(query):
    variants = build_query_variants(query)
    network_errors = []

    for variant in variants:
        for provider in (try_nominatim, try_photon):
            try:
                result = provider(variant)
            except URLError as error:
                network_errors.append(str(error.reason))
                continue

            if result:
                return result

    if network_errors:
        raise ValueError("Map lookup could not reach the internet. Check the connection, then try again.")

    raise ValueError(f'Could not find "{query}". Try adding city/state, for example "2 Shepherd Ln, Chapel Hill, NC".')


def build_query_variants(query):
    variants = [query]
    lower = query.lower()

    if "chapel hill" not in lower:
        variants.append(f"{query}, Chapel Hill, NC, USA")

    if "usa" not in lower and "united states" not in lower:
        variants.append(f"{query}, NC, USA")
        variants.append(f"{query}, USA")

    deduped = []
    for variant in variants:
        if variant not in deduped:
            deduped.append(variant)

    return deduped


def try_nominatim(query):
    url = "https://nominatim.openstreetmap.org/search?" + urlencode(
        {
            "q": query,
            "format": "jsonv2",
            "limit": "1",
        }
    )

    data = fetch_json(url)

    if not isinstance(data, list) or not data:
        return None

    result = data[0]
    try:
        latitude = float(result["lat"])
        longitude = float(result["lon"])
    except (KeyError, TypeError, ValueError):
        return None

    return {
        "latitude": latitude,
        "longitude": longitude,
        "label": str(result.get("display_name") or query),
    }


def try_photon(query):
    url = "https://photon.komoot.io/api/?" + urlencode(
        {
            "q": query,
            "limit": "1",
        }
    )
    data = fetch_json(url)
    feature = (data.get("features") or [None])[0]

    if not feature:
        return None

    coordinates = ((feature.get("geometry") or {}).get("coordinates")) or []

    if not isinstance(coordinates, list) or len(coordinates) < 2:
        return None

    longitude, latitude = coordinates[0], coordinates[1]

    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        return None

    properties = feature.get("properties") or {}
    label = ", ".join(
        str(part)
        for part in (
            properties.get("name"),
            properties.get("street"),
            properties.get("city"),
            properties.get("state"),
            properties.get("country"),
        )
        if part
    )

    return {
        "latitude": latitude,
        "longitude": longitude,
        "label": label or query,
    }


def fetch_road_route(start, destination):
    coordinates = f'{start["longitude"]},{start["latitude"]};{destination["longitude"]},{destination["latitude"]}'
    url = f"https://router.project-osrm.org/route/v1/driving/{coordinates}?" + urlencode(
        {
            "overview": "full",
            "geometries": "geojson",
            "steps": "true",
        }
    )
    data = fetch_json(url)
    route = (data.get("routes") or [None])[0]

    if not route:
        raise ValueError("Routing service did not return a driving route.")

    coordinates_list = (((route.get("geometry") or {}).get("coordinates")) or [])
    geometry = []

    for point in coordinates_list:
        if isinstance(point, list) and len(point) >= 2:
            longitude, latitude = point[0], point[1]
            if isinstance(latitude, (int, float)) and isinstance(longitude, (int, float)):
                geometry.append([latitude, longitude])

    if not geometry:
        raise ValueError("Routing service did not return route geometry.")

    return {
        "geometry": geometry,
        "distance": route.get("distance"),
        "duration": route.get("duration"),
        "cues": extract_turn_cues(route),
    }


def extract_turn_cues(route):
    cues = []
    step_number = 1

    for leg in route.get("legs") or []:
        for step in leg.get("steps") or []:
            maneuver = step.get("maneuver") or {}
            cue = build_turn_cue(step, maneuver, step_number)

            if cue:
                cues.append(cue)
                step_number += 1

    return cues


def build_turn_cue(step, maneuver, step_number):
    maneuver_type = str(maneuver.get("type") or "").replace("_", " ")
    modifier = str(maneuver.get("modifier") or "").replace("_", " ")
    location = maneuver.get("location") or []

    if maneuver_type in {"depart", "arrive"}:
        return None

    if not isinstance(location, list) or len(location) < 2:
        return None

    longitude, latitude = location[0], location[1]

    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        return None

    road_name = str(step.get("name") or "").strip()
    title = format_cue_title(maneuver_type, modifier, road_name)
    instruction = format_cue_instruction(maneuver_type, modifier, road_name)

    return {
        "id": f"generated-cue-{step_number}",
        "step": step_number,
        "title": title,
        "instruction": instruction,
        "notes": "Generated from the driving route. Replace with your own photo when ready.",
        "latitude": latitude,
        "longitude": longitude,
        "image": "",
    }


def format_cue_title(maneuver_type, modifier, road_name):
    direction = modifier.title() if modifier else maneuver_type.title()

    if road_name:
        return f"{direction} onto {road_name}"

    return direction


def format_cue_instruction(maneuver_type, modifier, road_name):
    parts = []

    if maneuver_type:
        parts.append(maneuver_type)

    if modifier:
        parts.append(modifier)

    instruction = " ".join(parts).strip().capitalize() or "Continue"

    if road_name:
        instruction = f"{instruction} onto {road_name}"

    return instruction + "."


def generate_geometry_cues(geometry):
    cues = []

    if len(geometry) < 3:
        return cues

    step_number = 1
    last_index = 0
    stride = max(5, len(geometry) // 80)

    for index in range(stride, len(geometry) - stride, stride):
        previous_point = geometry[index - stride]
        current_point = geometry[index]
        next_point = geometry[index + stride]
        turn_angle = calculate_turn_angle(previous_point, current_point, next_point)

        if abs(turn_angle) < 28:
            continue

        if index - last_index < stride * 3:
            continue

        direction = "Left" if turn_angle > 0 else "Right"
        cues.append(
            {
                "id": f"geometry-cue-{step_number}",
                "step": step_number,
                "title": f"{direction} turn cue",
                "instruction": f"Prepare for a {direction.lower()} turn or bend in the route.",
                "notes": "Estimated from saved route geometry. Replace with your own junction photo when ready.",
                "latitude": current_point[0],
                "longitude": current_point[1],
                "image": "",
            }
        )
        step_number += 1
        last_index = index

        if len(cues) >= 30:
            break

    if not cues:
        for point in sample_geometry_points(geometry, 5):
            cues.append(
                {
                    "id": f"geometry-cue-{step_number}",
                    "step": step_number,
                    "title": f"Route checkpoint {step_number}",
                    "instruction": "Continue along the generated route.",
                    "notes": "Estimated checkpoint from saved route geometry. Replace with your own junction photo when ready.",
                    "latitude": point[0],
                    "longitude": point[1],
                    "image": "",
                }
            )
            step_number += 1

    return cues


def calculate_turn_angle(previous_point, current_point, next_point):
    first_lat = current_point[0] - previous_point[0]
    first_lng = current_point[1] - previous_point[1]
    second_lat = next_point[0] - current_point[0]
    second_lng = next_point[1] - current_point[1]
    cross = first_lng * second_lat - first_lat * second_lng
    dot = first_lng * second_lng + first_lat * second_lat

    return math.degrees(math.atan2(cross, dot))


def sample_geometry_points(geometry, count):
    if len(geometry) <= 2:
        return []

    samples = []
    usable = geometry[1:-1]

    for index in range(1, count + 1):
        sample_index = round(index * (len(usable) - 1) / (count + 1))
        samples.append(usable[sample_index])

    return samples


def fetch_json(url):
    request = Request(url, headers=HTTP_HEADERS)

    with urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


class TaxiBoHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        path = urlparse(self.path).path
        if not path.startswith("/api/") and (
            path.endswith((".html", ".js", ".css")) or path in {"/", "/sw.js"}
        ):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/health":
            self.send_json(
                {
                    "ok": True,
                    "database": "postgresql" if USING_POSTGRES else "sqlite",
                }
            )
            return

        if path == "/api/routes":
            self.send_json(fetch_routes())
            return

        if path == "/api/incoming-order":
            orders = fetch_pending_orders()
            self.send_json({"ok": True, "orders": orders, "order": orders[0] if orders else None})
            return

        if path == "/api/accepted-trip":
            self.send_json({"ok": True, "trip": fetch_pending_accepted_trip()})
            return

        if path == "/api/route-recording/active":
            self.send_json({"ok": True, "recording": fetch_active_route_recording()})
            return

        if path == "/api/speed-warnings":
            self.send_json({"ok": True, "warnings": fetch_speed_warnings()})
            return

        super().do_GET()

    def do_PUT(self):
        if urlparse(self.path).path != "/api/routes":
            self.send_error(404, "Not found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))

            if not isinstance(payload, list):
                raise ValueError("Expected a route list.")

            replace_routes(payload)
            self.send_json({"ok": True, "routes": len(payload)})
        except Exception as error:
            self.send_json({"ok": False, "error": str(error)}, status=400)

    def do_POST(self):
        path = urlparse(self.path).path

        if path not in {"/api/generate-route", "/api/generate-cues", "/api/prepare-route", "/api/incoming-order", "/api/incoming-order/ack", "/api/incoming-order/verify", "/api/accepted-trip", "/api/accepted-trip/ack", "/api/ocr-order", "/api/route-recording/start", "/api/route-recording/update", "/api/route-recording/finish", "/api/route-recording/discard", "/api/speed-warnings", "/api/speed-warnings/delete"}:
            self.send_error(404, "Not found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))

            if path == "/api/incoming-order":
                self.send_json({"ok": True, "order": create_incoming_order(payload)})
                return

            if path == "/api/incoming-order/ack":
                self.send_json({"ok": True, "order": acknowledge_incoming_order(payload)})
                return

            if path == "/api/incoming-order/verify":
                self.send_json({"ok": True, **verify_incoming_order(payload)})
                return

            if path == "/api/accepted-trip":
                self.send_json({"ok": True, "trip": create_accepted_trip(payload)})
                return

            if path == "/api/accepted-trip/ack":
                self.send_json({"ok": True, "trip": acknowledge_accepted_trip(payload)})
                return

            if path == "/api/ocr-order":
                self.send_json({"ok": True, "ocr": recognize_order_image(payload)})
                return

            if path == "/api/route-recording/start":
                self.send_json({"ok": True, "recording": create_route_recording(payload)})
                return

            if path == "/api/route-recording/update":
                self.send_json({"ok": True, "recording": update_route_recording(payload)})
                return

            if path == "/api/route-recording/finish":
                self.send_json({"ok": True, "recording": update_route_recording(payload, finish=True)})
                return

            if path == "/api/route-recording/discard":
                self.send_json({"ok": True, "recording": discard_route_recording(payload)})
                return

            if path == "/api/speed-warnings":
                self.send_json({"ok": True, "warning": create_speed_warning(payload)})
                return

            if path == "/api/speed-warnings/delete":
                self.send_json({"ok": True, "warning": delete_speed_warning(payload)})
                return

            if path == "/api/generate-route":
                generated = generate_route(payload)
            elif path == "/api/prepare-route":
                generated = prepare_route(payload)
            else:
                generated = generate_cues(payload)

            self.send_json({"ok": True, "route": generated})
        except Exception as error:
            self.send_json({"ok": False, "error": str(error)}, status=400)

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "8000"))
    initialize_db()
    server = ThreadingHTTPServer(("0.0.0.0", port), TaxiBoHandler)
    print(f"Taxi Bo is running locally at http://127.0.0.1:{port}/index.html")
    print(f"On another device, open http://YOUR-WIFI-IP:{port}/index.html")
    print("Database: PostgreSQL" if USING_POSTGRES else f"SQLite database: {DB_PATH}")
    server.serve_forever()
