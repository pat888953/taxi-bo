# TaxiBo

TaxiBo is split into three focused modules:

- **TaxiBo Cue** (`index.html`) receives an accepted pickup and destination, then provides route photos, voice cues, speed awareness, and route recording.
- **TaxiBo 4-in-One** (`four-in-one.html`) collects OCR offers from separate fleet adapters, lets the driver compare them, and passes only a confirmed accepted trip to TaxiBo Cue.
- **TaxiBo Academy** (`academy.html`) turns saved route cue photos into multiple-choice practice questions so drivers can train themselves before a trip.

The Android FlyTaxi adapter lives in `android-companion` and posts scanned offers to TaxiBo 4-in-One.

## What this first version does

- Create routes with a start, destination, and notes
- Save multiple route variants for the same destination
- Add junction photos to each route
- Review saved photos in route order
- Simulate route progress on desktop and preview the next 3 upcoming photos
- Show mapped photo stops and a route line for coordinates you add
- Generate and save a driving route from your current location to a typed destination
- Save generated left/right turn cues with coordinates for the route rehearsal timeline
- Rebuild generated turn cues for an existing saved route from its stored endpoint coordinates
- Try to draw an actual driving route between mapped stops
- Search saved routes by destination, route name, start point, or notes
- Store routes and photo stops in a local SQLite database
- Export and import your route library as JSON backups
- Pick stop coordinates by clicking directly on the map
- Search for places to center the map
- Fill stop coordinates from a searched address or place name
- Edit and delete saved routes
- Edit and delete saved photo stops
- Install the app to a phone home screen when served over HTTP/HTTPS
- Cache the app shell for basic offline opening after first load
- Store route data locally in `taxi_bo.db`
- Send an OCR-extracted destination from the phone page to the tablet page
- Use PostgreSQL automatically when `DATABASE_URL` is configured
- Record the actual GPS path whenever live drive is running
- Checkpoint active recordings to the database and recover interrupted trips
- Save a completed drive as a reusable route variant such as `Passenger shortcut`
- Practice route memory in TaxiBo Academy with photo-based multiple-choice questions
- Track Academy attempts, accuracy, and recent review history in the database

## How to use it

1. Start the local server:

   ```powershell
   python server.py
   ```

   If port 8000 is already busy, choose another port:

   ```powershell
   python server.py 8010
   ```

   If Python is not on your PATH, use the bundled runtime:

   ```powershell
   & "C:\Users\as400\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" server.py
   ```

2. Open the required module:

   - TaxiBo Cue: `http://127.0.0.1:8000/index.html`
   - TaxiBo 4-in-One: `http://127.0.0.1:8000/four-in-one.html`
   - TaxiBo Academy: `http://127.0.0.1:8000/academy.html`

3. Create your own route, or enter a destination and use `Generate and save route` to start from your current location.
4. Add photos for key junctions and landmarks.
5. Add latitude and longitude if you want that stop to appear on the map.
6. Or enable map picking and click on the map to fill the coordinates automatically.
7. Use destination search to quickly narrow the saved routes.
8. Use export/import to back up or move your route library.
9. Pick the destination in Drive Rehearsal and press `Replay photo sequence`.
10. Use the Edit and Delete buttons in the route library and photo timeline to keep your route data current.
11. When your browser offers install, add Taxi Bo to your home screen for a more app-like experience.
12. Use the place lookup boxes when you want coordinates from an address instead of entering them manually.
13. Use variant name, best time, and traffic pattern fields when you have different routes for the same destination.
14. Use Simulation mode to test the next 3 upcoming photos on a non-moving PC.
15. Start Live Drive to record the actual GPS path, then stop the drive and save or discard the recording.
16. Save a passenger-recommended route with a descriptive variant name so it can be selected on a future trip.
17. Open TaxiBo Academy to practice saved street photos as multiple-choice questions.

## Notes

- This version runs with a small local Python backend.
- Routes and photos are stored in the local SQLite database file `taxi_bo.db`.
- Generated route lines and endpoint coordinates are also stored in SQLite.
- Generated turn cues are stored as photo cue rows with coordinates, ready for you to replace with real junction photos.
- Export/import JSON is still available for backups and moving data.
- The map uses Leaflet and OpenStreetMap tiles, so the browser needs internet access for the basemap.
- Place search and reverse lookup use OpenStreetMap Nominatim, so those helpers also need network access.
- Quick route generation uses OpenStreetMap/Photon place lookup and the public OSRM demo service, so the local server needs internet access.
- Road routing uses the public OSRM demo service when available, and falls back to a straight-line preview for photo-stop routes if not.
- Exported JSON files include your route details and stored image data URLs.
- The service worker caches the app shell, but live map tiles still depend on network availability.
- Active route recordings are checkpointed approximately every 12 seconds. If the page closes unexpectedly, the latest active trip is offered for recovery on the next load.
- Academy questions are generated from saved photo stops. Add cue photos and useful instructions first for the best quiz answers.

## Deploy to Render

Taxi Bo can run as a free Render web service with an external PostgreSQL database. Do not use the local SQLite file as cloud storage because free Render web services do not provide persistent disks.

1. Create a PostgreSQL database in Neon and copy its connection string.
2. Push this folder to a GitHub repository. The local `taxi_bo.db` file is intentionally excluded by `.gitignore`.
3. In Render, select **New > Blueprint** and connect the repository containing `render.yaml`.
4. When Render asks for `DATABASE_URL`, paste the Neon connection string.
5. Deploy and wait for `/api/health` to report `{"ok": true, "database": "postgresql"}`.
6. Open the Render URL on the tablet at `/index.html` and on the Android phone at `/phone.html`.

Render configuration is defined in `render.yaml`:

```yaml
buildCommand: pip install -r requirements.txt
startCommand: python server.py
healthCheckPath: /api/health
```

The server reads Render's `PORT` automatically. Local runs continue to use SQLite whenever `DATABASE_URL` is not set.

Render is pinned to Python 3.12 through `.python-version` because the OCR runtime currently requires Python below 3.13.

Existing local routes are not uploaded automatically. Export the route library locally, then import it through the cloud app after PostgreSQL is connected.
