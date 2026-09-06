const STORAGE_KEY = "taxiboStreetMapRoutesV2";
const REPORT_STORAGE_KEY = "taxiboStreetMapReportsV1";
const HK_CENTER = [114.1694, 22.3193];
const CAMERA = {
  zoom: 19.3,
  pitch: 70,
  lookAheadProgress: 0.018,
  padding: { top: 142, right: 48, bottom: 245, left: 48 },
  duration: 150
};

const routeSelect = document.querySelector("#routeSelect");
const loadRouteButton = document.querySelector("#loadRoute");
const startNavButton = document.querySelector("#startNav");
const pauseNavButton = document.querySelector("#pauseNav");
const liveDriveButton = document.querySelector("#liveDrive");
const saveDriveButton = document.querySelector("#saveDrive");
const recenterButton = document.querySelector("#recenterButton");
const reportTrafficButton = document.querySelector("#reportTraffic");
const nextDistance = document.querySelector("#nextDistance");
const nextInstruction = document.querySelector("#nextInstruction");
const routeStatus = document.querySelector("#routeStatus");
const etaValue = document.querySelector("#etaValue");
const distanceValue = document.querySelector("#distanceValue");
const speedValue = document.querySelector("#speedValue");

let routes = [];
let reports = [];
let map = null;
let mapReady = false;
let activeRoute = null;
let activeLine = [];
let cumulative = [];
let rawLine = [];
let rawCumulative = [];
let maneuvers = [];
let animationId = null;
let liveWatchId = null;
let livePoints = [];
let startedAt = 0;
let pausedAt = 0;
let durationMs = 26000;
let playbackRate = 1;
let latestProgress = 0;
let vehicleMarker = null;
let offRouteReadings = 0;
let rerouteInFlight = false;
let lastRerouteAt = 0;

initializeNavigation();

loadRouteButton.addEventListener("click", loadSelectedRoute);
startNavButton.addEventListener("click", () => startNavigation(1));
document.querySelector("#briefNav").addEventListener("click", () => startNavigation(10));
pauseNavButton.addEventListener("click", pauseNavigation);
liveDriveButton.addEventListener("click", toggleLiveDrive);
saveDriveButton.addEventListener("click", saveLiveDrive);
recenterButton.addEventListener("click", () => updateCamera(latestProgress, true));
reportTrafficButton.addEventListener("click", reportTraffic);
document.querySelectorAll("[data-voice-target]").forEach((button) => {
  button.addEventListener("click", () => captureVoiceLocation(button));
});

let activeRecognition = null;

function captureVoiceLocation(button) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    planStatus.textContent = "Voice input is not supported by this browser. Try Chrome on the phone.";
    return;
  }
  if (activeRecognition) {
    activeRecognition.stop();
    return;
  }

  const input = document.querySelector(`#${button.dataset.voiceTarget}`);
  const recognition = new SpeechRecognition();
  activeRecognition = recognition;
  recognition.lang = navigator.language || "en-HK";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  button.classList.add("listening");
  button.textContent = "●";
  document.querySelectorAll("[data-voice-target]").forEach((item) => { item.disabled = item !== button; });
  planStatus.textContent = `Listening for ${button.dataset.voiceTarget === "journeyStart" ? "start location" : "destination"}…`;

  recognition.addEventListener("result", (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript?.trim();
    if (!transcript) return;
    input.value = transcript;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    planStatus.textContent = `Voice entered: ${transcript}. Check it, then press Go.`;
  });
  recognition.addEventListener("error", (event) => {
    const messages = {
      "not-allowed": "Allow microphone permission for NaviDrive, then try again.",
      "no-speech": "No speech heard. Tap the microphone and try again.",
      "audio-capture": "The phone microphone is unavailable."
    };
    planStatus.textContent = messages[event.error] || `Voice input failed: ${event.error}.`;
  });
  recognition.addEventListener("end", () => {
    activeRecognition = null;
    button.classList.remove("listening");
    button.textContent = "🎤";
    document.querySelectorAll("[data-voice-target]").forEach((item) => { item.disabled = false; });
  });
  recognition.start();
}

async function initializeNavigation() {
  nextDistance.textContent = "Loading";
  nextInstruction.textContent = "Loading saved routes";
  routeStatus.textContent = "Checking TaxiBoMap services...";

  routes = await loadRoutes();
  reports = await loadReports();
  renderRouteOptions();

  if (!window.maplibregl) {
    nextDistance.textContent = "Map unavailable";
    nextInstruction.textContent = "MapLibre did not load";
    routeStatus.textContent = "Check internet/CDN access, then refresh this page.";
    return;
  }

  map = createNavigationMap();
  map.on("error", (event) => {
    const message = event?.error?.message || "Map tile/source error.";
    routeStatus.textContent = message.includes("tile") ? "Map tiles are not loading. Check internet access." : message;
  });
  map.on("load", async () => {
    mapReady = true;
    addNavigationLayers();
    nextDistance.textContent = 'Ready';
    nextInstruction.textContent = 'Enter a start and destination, then Go';
    routeStatus.textContent = 'Plan a Hong Kong journey.';
  });
}

function createNavigationMap() {
  return new maplibregl.Map({
    container: "navMap",
    center: HK_CENTER,
    zoom: 12.5,
    pitch: 48,
    bearing: -18,
    maxZoom: 22,
    maxPitch: 80,
    attributionControl: true,
    style: {
      version: 8,
      sources: {
        osmRaster: {
          type: "raster",
          tiles: [
            "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
            "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
          ],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap"
        }
      },
      layers: [{ id: "osmRaster", type: "raster", source: "osmRaster" }]
    }
  });
}

async function loadRoutes() {
  try {
    const response = await fetch("/api/routes");
    if (!response.ok) throw new Error("API routes unavailable.");
    const apiRoutes = await response.json();
    return [...loadCueImports(), ...apiRoutes.map(normalizeRoute).filter((route) => route.points.length >= 2)];
  } catch {
    return [...loadCueImports(), ...loadLocalRoutes()];
  }
}

async function loadReports() {
  try {
    const response = await fetch("/api/reports");
    if (!response.ok) throw new Error("API reports unavailable.");
    const apiReports = await response.json();
    return apiReports.map(normalizeReport).filter(isInsideHongKong);
  } catch {
    return loadLocalReports();
  }
}

function loadLocalRoutes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeRoute).filter((route) => route.points.length >= 2) : [];
  } catch {
    return [];
  }
}

function loadLocalReports() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REPORT_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(normalizeReport).filter(isInsideHongKong) : [];
  } catch {
    return [];
  }
}

function renderRouteOptions() {
  routeSelect.innerHTML = "";
  if (!routes.length) {
    routeSelect.innerHTML = `<option>No saved routes</option>`;
    routeStatus.textContent = "Record or import a route first";
    return;
  }

  for (const route of routes) {
    const option = document.createElement("option");
    option.value = route.id;
    option.textContent = route.name;
    routeSelect.append(option);
  }
}

async function loadSelectedRoute() {
  const route = routes.find((item) => item.id === routeSelect.value);
  if (!route) return;
  if (!mapReady) {
    routeStatus.textContent = "Route is selected, but the map is not ready yet.";
    return;
  }

  pauseNavigation();
  stopLiveDrive();
  pausedAt = 0;
  activeRoute = route;
  document.querySelector("#journeyName").textContent = route.name;
  activeLine = route.matchedPoints.length ? route.matchedPoints : route.points;
  rawLine = route.matchedPoints.length ? route.points : [];
  cumulative = buildCumulativeDistances(activeLine);
  rawCumulative = buildCumulativeDistances(rawLine);
  maneuvers = buildFallbackManeuvers(activeLine);
  durationMs = Math.max(18000, Math.min(62000, totalLineDistance(activeLine) * 3.2));
  latestProgress = 0;

  map.getSource("activeRoute").setData(lineFeature(activeLine));
  map.getSource("rawRoute").setData(lineFeature(rawLine));
  vehicleMarker?.setLngLat([activeLine[0].longitude, activeLine[0].latitude]).setRotation(0);
  map.getSource("rawVehicle").setData(rawLine.length ? pointFeature(rawLine[0], 0) : emptyPointFeature());
  map.getSource("snapTether").setData(lineFeature([]));
  reports = await loadReports();
  renderReportOverlays();
  if (activeRoute.planned) {
    maneuvers = normalizeManeuvers(activeRoute.planned.maneuvers, totalLineDistance(activeLine));
    durationMs = Math.max(1000, activeRoute.planned.summary.durationSeconds * 1000);
    routeStatus.textContent = activeRoute.planned.engine + '. ' + activeRoute.planned.explanation;
  } else if (activeRoute.cuePackage) {
    durationMs = Math.max(18000, totalLineDistance(activeLine) / (30 / 3.6) * 1000);
    routeStatus.textContent = 'Imported Cue geometry preserved. Not road-validated.';
  } else { await enrichRouteFromValhalla(); }
  updateNavigationHud(0);
  updateCamera(0, true);
  setJourneyCollapsed(true);
}

async function enrichRouteFromValhalla() {
  if (!activeLine.length) return;
  routeStatus.textContent = "Loading Valhalla turns...";
  const first = activeLine[0];
  const last = activeLine.at(-1);

  try {
    const response = await fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        costing: "taxi",
        locations: [
          { latitude: first.latitude, longitude: first.longitude },
          { latitude: last.latitude, longitude: last.longitude }
        ]
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Valhalla route unavailable.");

    const valhallaLine = normalizePoints(payload.geometry);
    if (valhallaLine.length >= 2 && activeRoute?.matchStatus !== "matched") {
      activeLine = valhallaLine;
      cumulative = buildCumulativeDistances(activeLine);
      map.getSource("activeRoute").setData(lineFeature(activeLine));
      map.getSource("rawRoute").setData(lineFeature(rawLine));
      renderReportOverlays();
    }
    maneuvers = normalizeManeuvers(payload.maneuvers, totalLineDistance(activeLine));
    const minutes = Math.max(1, Math.round(Number(payload.summary?.durationSeconds || durationMs / 1000) / 60));
    durationMs = Math.max(18000, minutes * 60000);
    routeStatus.textContent = statusText(activeRoute, reportsNearRoute().length);
  } catch {
    routeStatus.textContent = `${statusText(activeRoute, reportsNearRoute().length)}. Basic turns only`;
  }
}

function addNavigationLayers() {
  map.addSource("rawRoute", emptyLineSource());
  map.addSource("activeRoute", emptyLineSource());
  map.addSource("trafficSlow", emptyLineSource());
  map.addSource("trafficJam", emptyLineSource());
  map.addSource("snapTether", emptyLineSource());
  map.addSource("liveGpsTrail", emptyLineSource());
  map.addSource("reportMarkers", emptyFeatureCollectionSource());
  map.addSource("rawVehicle", pointSource(HK_CENTER));

  map.addLayer({
    id: "rawRoute",
    type: "line",
    source: "rawRoute",
    paint: {
      "line-color": "#d78a1f",
      "line-width": 3,
      "line-dasharray": [1.4, 1.8],
      "line-opacity": 0.42
    }
  });

  map.addLayer({
    id: "activeRouteCasing",
    type: "line",
    source: "activeRoute",
    paint: {
      "line-color": "#ffffff",
      "line-width": 17,
      "line-opacity": 0.96
    }
  });

  map.addLayer({
    id: "activeRoute",
    type: "line",
    source: "activeRoute",
    paint: {
      "line-color": "#23a455",
      "line-width": 10,
      "line-opacity": 0.92
    }
  });

  map.addLayer({
    id: "trafficSlow",
    type: "line",
    source: "trafficSlow",
    paint: {
      "line-color": "#e4ad22",
      "line-width": 12,
      "line-opacity": 0.96
    }
  });

  map.addLayer({
    id: "trafficJam",
    type: "line",
    source: "trafficJam",
    paint: {
      "line-color": "#cf2f2f",
      "line-width": 12,
      "line-opacity": 0.96
    }
  });

  map.addLayer({
    id: "reportMarkers",
    type: "circle",
    source: "reportMarkers",
    paint: {
      "circle-color": ["get", "color"],
      "circle-radius": 8,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-opacity": 0.9
    }
  });

  map.addLayer({
    id: "snapTether",
    type: "line",
    source: "snapTether",
    paint: {
      "line-color": "#1a75ff",
      "line-width": 3,
      "line-dasharray": [1, 1.4],
      "line-opacity": 0.72
    }
  });

  map.addLayer({
    id: "liveGpsTrail",
    type: "line",
    source: "liveGpsTrail",
    paint: {
      "line-color": "#1478ff",
      "line-width": 4,
      "line-dasharray": [1, 1.2],
      "line-opacity": 0.62
    }
  });

  map.addLayer({
    id: "rawVehicle",
    type: "circle",
    source: "rawVehicle",
    paint: {
      "circle-color": "#d78a1f",
      "circle-radius": 6,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-opacity": 0.86
    }
  });

  const markerElement = document.createElement("div");
  markerElement.className = "navidrive-vehicle-marker";
  markerElement.setAttribute("aria-label", "Vehicle position");
  vehicleMarker = new maplibregl.Marker({
    element: markerElement,
    rotationAlignment: "map",
    pitchAlignment: "map"
  }).setLngLat(HK_CENTER).addTo(map);
}

function startNavigation(rate = 1) {
  if (!mapReady || !activeLine.length) return;
  setJourneyCollapsed(true);
  pauseNavigation();
  stopLiveDrive();
  if (latestProgress >= 1) latestProgress = 0;
  playbackRate = rate;
  document.querySelector('#driveMode').textContent = rate === 10 ? 'Brief · 10× preview' : 'Route replay';
  startedAt = performance.now() - latestProgress * durationMs / playbackRate;
  pausedAt = 0;
  animationId = requestAnimationFrame(tick);
}

function pauseNavigation() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
    latestProgress = Math.min(1, (performance.now() - startedAt) * playbackRate / durationMs);
  }
}

function toggleLiveDrive() {
  if (liveWatchId !== null) {
    stopLiveDrive();
    return;
  }
  startLiveDrive();
}

function startLiveDrive() {
  if (!mapReady) {
    routeStatus.textContent = "Map is not ready yet.";
    return;
  }
  if (!navigator.geolocation) {
    routeStatus.textContent = "This phone/browser does not support GPS.";
    return;
  }
  if (!window.isSecureContext) {
    routeStatus.textContent = "Phone GPS needs HTTPS or localhost. Use Chrome with site permission, or serve this page by HTTPS.";
    return;
  }

  pauseNavigation();
  document.querySelector("#driveMode").textContent = "Live GPS";
  livePoints = [];
  liveDriveButton.textContent = "Stop Live";
  liveDriveButton.classList.add("live");
  nextDistance.textContent = "Live";
  nextInstruction.textContent = "Waiting for phone GPS";
  routeStatus.textContent = "Allow location permission on the phone.";

  liveWatchId = navigator.geolocation.watchPosition(
    handleLivePosition,
    (error) => {
      routeStatus.textContent = error.message || "Could not read phone GPS.";
      stopLiveDrive(false);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 12000
    }
  );
}

function stopLiveDrive(clearStatus = true) {
  if (liveWatchId !== null) {
    navigator.geolocation.clearWatch(liveWatchId);
    liveWatchId = null;
  }
  liveDriveButton.textContent = "Live Drive";
  liveDriveButton.classList.remove("live");
  offRouteReadings = 0;
  if (clearStatus && livePoints.length) {
    routeStatus.textContent = `Live drive stopped. ${livePoints.length} GPS points captured.`;
  }
}

function handleLivePosition(position) {
  const point = {
    latitude: Number(position.coords.latitude),
    longitude: Number(position.coords.longitude),
    accuracy: Number(position.coords.accuracy || 0),
    speed: Number.isFinite(Number(position.coords.speed)) ? Number(position.coords.speed) : null,
    recordedAt: new Date().toISOString()
  };

  if (!isInsideHongKong(point)) {
    routeStatus.textContent = "GPS point is outside Hong Kong test area.";
    return;
  }

  const previous = livePoints.at(-1);
  if (!previous || distanceMeters(previous, point) >= 5) {
    livePoints.push(point);
    map.getSource("liveGpsTrail").setData(lineFeature(livePoints));
  }

  const snapped = activeLine.length ? nearestPointOnLine(point, activeLine, cumulative) : { point, progress: 0, distance: 0 };
  const ahead = activeLine.length
    ? pointAtProgress(activeLine, cumulative, Math.min(1, snapped.progress + 0.018))
    : point;
  const bearing = activeLine.length ? bearingBetween(snapped.point, ahead) : Number(position.coords.heading || 0);
  const driftText = formatMeters(snapped.distance);
  const onRoute = snapped.distance <= Math.max(35, point.accuracy * 2);
  const reliableOffRoute = !onRoute && point.accuracy <= 60 && snapped.progress < 0.99;

  offRouteReadings = reliableOffRoute ? offRouteReadings + 1 : 0;
  if (offRouteReadings >= 3 && !rerouteInFlight && Date.now() - lastRerouteAt >= 20000) {
    void rerouteFromCurrentPosition(point);
  }

  latestProgress = snapped.progress;
  vehicleMarker?.setLngLat([snapped.point.longitude, snapped.point.latitude]).setRotation(bearing);
  map.getSource("rawVehicle").setData(pointFeature(point, bearing));
  map.getSource("snapTether").setData(snapped.distance > 8 ? lineFeature([point, snapped.point]) : lineFeature([]));
  map.easeTo({
    center: activeLine.length ? [ahead.longitude, ahead.latitude] : [point.longitude, point.latitude],
    zoom: CAMERA.zoom,
    pitch: CAMERA.pitch,
    bearing,
    padding: CAMERA.padding,
    duration: CAMERA.duration,
    easing: (t) => t
  });

  nextDistance.textContent = onRoute ? "On route" : "Off route";
  nextInstruction.textContent = activeLine.length ? instructionForProgress(snapped.progress, totalLineDistance(activeLine)).text : "Recording live GPS";
  speedValue.textContent = point.speed === null ? "0" : String(Math.max(0, Math.round(point.speed * 3.6)));
  distanceValue.textContent = activeLine.length ? (totalLineDistance(activeLine) * (1 - snapped.progress) / 1000).toFixed(1) : "--";
  etaValue.textContent = activeLine.length && point.speed > 0 ? String(Math.ceil(totalLineDistance(activeLine) * (1 - snapped.progress) / point.speed / 60)) : "--";
  if (!rerouteInFlight) {
    const rerouteNotice = reliableOffRoute ? ` Reroute check ${Math.min(offRouteReadings, 3)}/3.` : "";
    routeStatus.textContent = `GPS drift ${driftText}. Accuracy ${Math.round(point.accuracy)} m. ${livePoints.length} points.${rerouteNotice}`;
  }
}

async function rerouteFromCurrentPosition(point) {
  const destination = activeRoute?.planned?.destination || activeLine.at(-1);
  if (!destination || !isInsideHongKong(destination)) return;

  rerouteInFlight = true;
  lastRerouteAt = Date.now();
  offRouteReadings = 0;
  nextDistance.textContent = "Rerouting";
  nextInstruction.textContent = "Finding a new route";
  routeStatus.textContent = "Off route. Recalculating with Valhalla + HDE…";

  try {
    const response = await fetch("/api/navidrive/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: point, destination }),
      signal: AbortSignal.timeout(120000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Reroute failed.");

    const reroutedLine = normalizePoints(result.geometry);
    if (reroutedLine.length < 2) throw new Error("Valhalla returned an empty reroute.");

    activeRoute = {
      ...activeRoute,
      name: `${result.start.label || "Current location"} → ${result.destination.label || "Destination"}`,
      points: reroutedLine,
      matchedPoints: [],
      planned: result
    };
    activeLine = reroutedLine;
    rawLine = [];
    cumulative = buildCumulativeDistances(activeLine);
    rawCumulative = [];
    maneuvers = normalizeManeuvers(result.maneuvers, totalLineDistance(activeLine));
    durationMs = Math.max(1000, Number(result.summary?.durationSeconds || 0) * 1000);
    latestProgress = 0;
    map.getSource("activeRoute").setData(lineFeature(activeLine));
    map.getSource("rawRoute").setData(lineFeature([]));
    map.getSource("rawVehicle").setData(emptyPointFeature());
    map.getSource("snapTether").setData(lineFeature([]));
    renderReportOverlays();
    document.querySelector("#journeyName").textContent = activeRoute.name;
    nextDistance.textContent = "New route";
    nextInstruction.textContent = instructionForProgress(0, totalLineDistance(activeLine)).text;
    routeStatus.textContent = `${result.engine}. Route recalculated from your current position.`;
  } catch (error) {
    nextDistance.textContent = "Off route";
    nextInstruction.textContent = "Continue safely while NaviDrive retries";
    routeStatus.textContent = `Reroute unavailable: ${error.message}`;
  } finally {
    rerouteInFlight = false;
  }
}

async function saveLiveDrive() {
  if (livePoints.length < 2) {
    routeStatus.textContent = "Drive first. At least 2 GPS points are needed.";
    return;
  }

  const now = new Date();
  const route = normalizeRoute({
    id: createNavigationId(),
    name: `Mobile live drive ${now.toLocaleString()}`,
    start: activeRoute?.name || "Phone GPS",
    destination: "Field test route",
    notes: "Recorded from Navigation Mode Live Drive",
    points: livePoints
  });

  try {
    const response = await fetch("/api/routes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(route)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not save live drive.");
    const saved = normalizeRoute(payload);
    routes.unshift(saved);
    renderRouteOptions();
    routeSelect.value = saved.id;
    routeStatus.textContent = `Saved live drive with ${livePoints.length} GPS points.`;
  } catch (error) {
    localStorage.setItem(`taxiboLiveDrive-${Date.now()}`, JSON.stringify(route));
    routeStatus.textContent = `${error.message || "Could not save to PostGIS."} Saved local backup on this phone.`;
  }
}

function tick(now) {
  latestProgress = Math.min(1, (now - startedAt) * playbackRate / durationMs);
  updateNavigationHud(latestProgress);
  updateCamera(latestProgress, false);

  if (latestProgress < 1) {
    animationId = requestAnimationFrame(tick);
  } else {
    animationId = null;
    pausedAt = 0;
    nextDistance.textContent = "Arrived";
    nextInstruction.textContent = "Destination reached";
  }
}

function updateCamera(progress, immediate) {
  if (!activeLine.length) return;
  const current = pointAtProgress(activeLine, cumulative, progress);
  const ahead = pointAtProgress(activeLine, cumulative, Math.min(1, progress + 0.024));
  const cameraTarget = pointAtProgress(activeLine, cumulative, Math.min(1, progress + CAMERA.lookAheadProgress));
  const bearing = bearingBetween(current, ahead);
  const rawCurrent = rawLine.length ? pointAtProgress(rawLine, rawCumulative, progress) : null;
  const driftMeters = rawCurrent ? distanceMeters(rawCurrent, current) : 0;

  vehicleMarker?.setLngLat([current.longitude, current.latitude]).setRotation(bearing);
  map.getSource("rawVehicle").setData(rawCurrent ? pointFeature(rawCurrent, bearing) : emptyPointFeature());
  map.getSource("snapTether").setData(rawCurrent && driftMeters > 12 ? lineFeature([rawCurrent, current]) : lineFeature([]));
  map.easeTo({
    center: [cameraTarget.longitude, cameraTarget.latitude],
    zoom: CAMERA.zoom,
    pitch: CAMERA.pitch,
    bearing,
    padding: CAMERA.padding,
    duration: immediate ? 0 : CAMERA.duration,
    easing: (t) => t
  });
}

function updateNavigationHud(progress) {
  const total = totalLineDistance(activeLine);
  const remaining = Math.max(0, total * (1 - progress));
  const speedKmh = Math.max(12, Math.round((total / durationMs) * 3600));
  const remainingMinutes = Math.max(1, Math.round((durationMs * (1 - progress)) / 60000));
  const instruction = instructionForProgress(progress, total);

  nextDistance.textContent = instruction.distanceText;
  nextInstruction.textContent = instruction.text;
  etaValue.textContent = String(remainingMinutes);
  distanceValue.textContent = (remaining / 1000).toFixed(1);
  speedValue.textContent = String(speedKmh);
}

async function reportTraffic() {
  if (!mapReady) return;
  const current = pointAtProgress(activeLine, cumulative, latestProgress);
  if (!current) return;
  try {
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportType: "traffic",
        title: "Traffic slowdown",
        notes: "Navigation mode quick report",
        confidence: 70,
        latitude: current.latitude,
        longitude: current.longitude
      })
    });
    const payload = response.ok ? await response.json() : null;
    if (payload) {
      reports.unshift(normalizeReport(payload));
    } else {
      reports.unshift(normalizeReport({
        reportType: "traffic",
        title: "Traffic slowdown",
        notes: "Local navigation report",
        confidence: 70,
        latitude: current.latitude,
        longitude: current.longitude
      }));
    }
    renderReportOverlays();
    routeStatus.textContent = statusText(activeRoute, reportsNearRoute().length);
    flashReportButton("Reported");
  } catch {
    reports.unshift(normalizeReport({
      reportType: "traffic",
      title: "Traffic slowdown",
      notes: "Local navigation report",
      confidence: 70,
      latitude: current.latitude,
      longitude: current.longitude
    }));
    renderReportOverlays();
    flashReportButton("Local");
  }
}

function renderReportOverlays() {
  if (!activeLine.length) return;
  const nearbyReports = reportsNearRoute();
  const slowSegments = [];
  const jamSegments = [];

  for (const report of nearbyReports) {
    const nearest = nearestProgressOnLine(report, activeLine, cumulative);
    const width = report.reportType === "road_closure" || report.confidence >= 80 ? 0.035 : 0.025;
    const segment = sliceLine(activeLine, Math.max(0, nearest.progress - width), Math.min(1, nearest.progress + width));
    if (report.reportType === "accident" || report.reportType === "road_closure" || report.confidence >= 80) {
      jamSegments.push(...segment);
    } else {
      slowSegments.push(...segment);
    }
  }

  map.getSource("trafficSlow").setData(multiLineFeature(chunkSegments(slowSegments)));
  map.getSource("trafficJam").setData(multiLineFeature(chunkSegments(jamSegments)));
  map.getSource("reportMarkers").setData({
    type: "FeatureCollection",
    features: nearbyReports.map((report) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [report.longitude, report.latitude] },
      properties: {
        title: report.title,
        color: reportColor(report.reportType, report.confidence)
      }
    }))
  });
}

function reportsNearRoute() {
  if (!activeLine.length) return [];
  return reports.filter((report) => {
    const nearest = nearestProgressOnLine(report, activeLine, cumulative);
    return nearest.distance <= 420;
  });
}

function instructionForProgress(progress, totalMeters) {
  if (!maneuvers.length) {
    return { text: "Follow the highlighted taxi route", distanceText: formatMeters(totalMeters * (1 - progress)) };
  }

  const currentMeters = totalMeters * progress;
  const next = maneuvers.find((maneuver) => maneuver.endMeters >= currentMeters) || maneuvers.at(-1);
  const distanceToNext = Math.max(0, next.startMeters - currentMeters);
  return {
    text: next.instruction || "Continue",
    distanceText: distanceToNext > 25 ? formatMeters(distanceToNext) : "Now"
  };
}

function normalizeManeuvers(value, totalMeters) {
  if (!Array.isArray(value) || !value.length) return buildFallbackManeuvers(activeLine);
  let cursor = 0;
  const normalized = value.map((step, index) => {
    const distance = normalizeDistanceMeters(step.distance);
    const startMeters = Math.min(totalMeters, cursor);
    cursor += distance;
    return {
      instruction: cleanInstruction(step.instruction || describeClientStep(step, index)),
      startMeters,
      endMeters: Math.min(totalMeters, Math.max(cursor, startMeters + 1))
    };
  });
  if (normalized.length && normalized.at(-1).endMeters < totalMeters) {
    normalized.at(-1).endMeters = totalMeters;
  }
  return normalized;
}

function buildFallbackManeuvers(points) {
  const total = totalLineDistance(points);
  return [
    { instruction: "Start navigation", startMeters: 0, endMeters: total * 0.18 },
    { instruction: "Continue ahead", startMeters: total * 0.18, endMeters: total * 0.42 },
    { instruction: "Keep following the highlighted route", startMeters: total * 0.42, endMeters: total * 0.72 },
    { instruction: "Continue to destination", startMeters: total * 0.72, endMeters: total }
  ];
}

function normalizeRoute(route) {
  const points = normalizePoints(route.points);
  const matchedPoints = normalizePoints(route.matchedPoints || route.matchedGeometry);
  return {
    cuePackage: route.cuePackage,
    id: String(route.id || createNavigationId()),
    name: String(route.name || "Untitled route"),
    reviewStatus: String(route.reviewStatus || "draft"),
    trustScore: Number(route.trustScore || 0),
    matchStatus: String(route.matchStatus || "pending"),
    points,
    matchedPoints
  };
}

function normalizeReport(report) {
  return {
    id: String(report.id || createNavigationId()),
    reportType: String(report.reportType || "traffic"),
    title: String(report.title || "Live report"),
    notes: String(report.notes || ""),
    confidence: Math.max(0, Math.min(100, Number(report.confidence || 50))),
    latitude: Number(report.latitude),
    longitude: Number(report.longitude),
    reportedAt: String(report.reportedAt || new Date().toISOString())
  };
}

function normalizePoints(value) {
  if (Array.isArray(value)) {
    return value
      .map((point) => ({ latitude: Number(point.latitude), longitude: Number(point.longitude) }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  }
  if (value?.type === "LineString" && Array.isArray(value.coordinates)) {
    return value.coordinates
      .map(([longitude, latitude]) => ({ latitude: Number(latitude), longitude: Number(longitude) }))
      .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  }
  return [];
}

function sliceLine(points, start, end) {
  if (!points.length) return [];
  const distances = buildCumulativeDistances(points);
  const result = [];
  const steps = 22;
  for (let index = 0; index <= steps; index += 1) {
    result.push(pointAtProgress(points, distances, start + ((end - start) * index / steps)));
  }
  return result;
}

function chunkSegments(points) {
  if (points.length < 2) return [];
  const segments = [];
  for (let index = 0; index < points.length; index += 23) {
    const segment = points.slice(index, index + 23);
    if (segment.length >= 2) segments.push(segment);
  }
  return segments;
}

function buildCumulativeDistances(points) {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(distances[index - 1] + distanceMeters(points[index - 1], points[index]));
  }
  return distances;
}

function pointAtProgress(points, distances, progress) {
  if (!points.length) return null;
  const target = distances[distances.length - 1] * progress;
  for (let index = 1; index < distances.length; index += 1) {
    if (distances[index] >= target) {
      const segmentDistance = distances[index] - distances[index - 1] || 1;
      const local = (target - distances[index - 1]) / segmentDistance;
      return {
        latitude: points[index - 1].latitude + (points[index].latitude - points[index - 1].latitude) * local,
        longitude: points[index - 1].longitude + (points[index].longitude - points[index - 1].longitude) * local
      };
    }
  }
  return points[points.length - 1];
}

function nearestProgressOnLine(point, points, distances) {
  let nearest = { distance: Infinity, progress: 0 };
  const total = distances.at(-1) || 1;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const projection = projectPointToSegment(point, start, end);
    const segmentDistance = distanceMeters(start, end);
    const progressMeters = distances[index - 1] + segmentDistance * projection.t;
    if (projection.distance < nearest.distance) {
      nearest = { distance: projection.distance, progress: progressMeters / total };
    }
  }
  return nearest;
}

function nearestPointOnLine(point, points, distances) {
  let nearest = { distance: Infinity, progress: 0, point: points[0] };
  const total = distances.at(-1) || 1;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const projection = projectPointToSegment(point, start, end);
    const segmentDistance = distanceMeters(start, end);
    const progressMeters = distances[index - 1] + segmentDistance * projection.t;
    const projectedPoint = {
      latitude: start.latitude + (end.latitude - start.latitude) * projection.t,
      longitude: start.longitude + (end.longitude - start.longitude) * projection.t
    };
    if (projection.distance < nearest.distance) {
      nearest = { distance: projection.distance, progress: progressMeters / total, point: projectedPoint };
    }
  }
  return nearest;
}

function projectPointToSegment(point, start, end) {
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos(start.latitude * Math.PI / 180);
  const px = (point.longitude - start.longitude) * metersPerDegreeLon;
  const py = (point.latitude - start.latitude) * metersPerDegreeLat;
  const vx = (end.longitude - start.longitude) * metersPerDegreeLon;
  const vy = (end.latitude - start.latitude) * metersPerDegreeLat;
  const lengthSquared = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, (px * vx + py * vy) / lengthSquared));
  const dx = px - vx * t;
  const dy = py - vy * t;
  return { distance: Math.sqrt(dx * dx + dy * dy), t };
}

function totalLineDistance(points) {
  return buildCumulativeDistances(points).at(-1) || 0;
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

function bearingBetween(first, second) {
  const lat1 = first.latitude * Math.PI / 180;
  const lat2 = second.latitude * Math.PI / 180;
  const deltaLng = (second.longitude - first.longitude) * Math.PI / 180;
  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function lineFeature(points) {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: points.map((point) => [point.longitude, point.latitude]) },
    properties: {}
  };
}

function multiLineFeature(segments) {
  return {
    type: "Feature",
    geometry: {
      type: "MultiLineString",
      coordinates: segments.map((segment) => segment.map((point) => [point.longitude, point.latitude]))
    },
    properties: {}
  };
}

function pointFeature(point, bearing) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
    properties: { bearing }
  };
}

function emptyPointFeature() {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { bearing: 0 }
  };
}

function emptyLineSource() {
  return { type: "geojson", data: lineFeature([]) };
}

function emptyFeatureCollectionSource() {
  return { type: "geojson", data: { type: "FeatureCollection", features: [] } };
}

function pointSource(coordinates) {
  return {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: { type: "Point", coordinates },
      properties: { bearing: 0 }
    }
  };
}

function normalizeDistanceMeters(distance) {
  return Number(distance || 0);
}

function formatMeters(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.max(30, Math.round(meters / 10) * 10)} m`;
}

function cleanInstruction(value) {
  return String(value || "Continue").replace(/\s+/g, " ").trim();
}

function describeClientStep(step, index) {
  const road = step.name ? ` onto ${step.name}` : "";
  const direction = step.modifier ? ` ${step.modifier}` : "";
  if (index === 0 || step.type === "depart") return step.name ? `Start on ${step.name}` : "Start navigation";
  if (step.type === "arrive") return "Arrive at destination";
  if (step.type === "turn") return `Turn${direction}${road}`;
  if (step.type === "fork") return `Keep${direction}${road}`;
  if (step.type === "off ramp") return `Take the exit${direction}${road}`;
  if (step.type === "on ramp") return `Take the ramp${direction}${road}`;
  if (step.type === "merge") return `Merge${direction}${road}`;
  return step.name ? `Continue on ${step.name}` : "Continue";
}

function reportColor(type, confidence) {
  if (type === "accident" || type === "road_closure" || confidence >= 80) return "#cf2f2f";
  if (type === "tunnel_delay" || type === "traffic") return "#e4ad22";
  return "#1478ff";
}

function statusText(route, reportCount) {
  const routePart = route
    ? `${route.reviewStatus || "draft"} route, trust ${Math.round(route.trustScore || 0)}, ${route.matchStatus || "pending"}`
    : "No route";
  const reportPart = reportCount === 1 ? "1 live report nearby" : `${reportCount} live reports nearby`;
  return `${routePart}. ${reportPart}`;
}

function flashReportButton(label) {
  reportTrafficButton.textContent = label;
  reportTrafficButton.classList.add("report-pulse");
  setTimeout(() => {
    reportTrafficButton.textContent = "Traffic";
    reportTrafficButton.classList.remove("report-pulse");
  }, 1400);
}

function isInsideHongKong(point) {
  return point.latitude >= 22.13 &&
    point.latitude <= 22.58 &&
    point.longitude >= 113.80 &&
    point.longitude <= 114.45;
}

document.querySelector('#overviewButton').addEventListener('click', () => {
 pauseNavigation();
 if (!mapReady || !activeLine.length) return;
 const bounds = new maplibregl.LngLatBounds();
 activeLine.forEach(p => bounds.extend([p.longitude, p.latitude]));
 map.fitBounds(bounds, {padding: 100, pitch: 0, bearing: 0});
});
document.querySelector('#cameraButton').addEventListener('click', event => {
 const close = CAMERA.pitch !== 70;
 CAMERA.pitch = close ? 70 : 45;
 CAMERA.zoom = close ? 19.3 : 17.5;
 event.currentTarget.textContent = close ? 'View: Drive' : 'View: Urban';
 updateCamera(latestProgress, true);
});
window.addEventListener('pagehide', () => { pauseNavigation(); stopLiveDrive(); });

function loadCueImports() {
  try {
    const saved = JSON.parse(localStorage.getItem('taxiboCueImportsV1') || '[]');
    let changed = false;
    for (const route of saved) {
      if (route.cuePackage?.route && 'photos' in route.cuePackage.route) {
        delete route.cuePackage.route.photos;
        changed = true;
      }
    }
    if (changed) { try { localStorage.setItem('taxiboCueImportsV1', JSON.stringify(saved)); } catch {} }
    return saved.map(normalizeRoute);
  } catch { return []; }
}
document.querySelector('#importCueFile').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 40 * 1024 * 1024) throw new Error('Package exceeds 40 MB.');
    const {parseCuePackage} = await import('./cue-package.js');
    const imported = parseCuePackage(JSON.parse(await file.text()));
    const saved = loadCueImports().filter(r => r.id !== imported.id);
    let persisted = true;
    try { localStorage.setItem('taxiboCueImportsV1', JSON.stringify([imported, ...saved])); } catch { persisted = false; }
    routes = [imported, ...routes.filter(r => r.id !== imported.id)];
    renderRouteOptions(); routeSelect.value = imported.id;
    await loadSelectedRoute();
    document.querySelector('#importResult').textContent = persisted ? 'Imported and saved in this browser.' : 'Imported for this session only: browser storage is full. Keep your JSON file.';
  } catch(error) { document.querySelector('#importResult').textContent = error.message; }
  event.target.value = '';
});

let gpsStart = null;
const planStatus = document.querySelector('#planStatus');
const startInput = document.querySelector('#journeyStart');
startInput.addEventListener('input',()=>{gpsStart=null;});
document.querySelector('#useMyLocation').addEventListener('click',()=>{
 if(!window.isSecureContext || !navigator.geolocation) {planStatus.textContent='Location requires HTTPS or localhost. You can type your start instead.';return;}
 planStatus.textContent='Waiting for location permission...';
 navigator.geolocation.getCurrentPosition(position=>{
  gpsStart={latitude:position.coords.latitude,longitude:position.coords.longitude,label:'Current location'};
  if(!isInsideHongKong(gpsStart)){gpsStart=null;planStatus.textContent='Your location is outside Hong Kong. Type a Hong Kong start.';return;}
  startInput.value='Current location';planStatus.textContent='Start location set.';
 },error=>{planStatus.textContent=error.message;},{enableHighAccuracy:true,timeout:12000});
});
document.querySelector('#planJourney').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!mapReady){planStatus.textContent='Wait for the map to finish loading.';return;}
 const button=document.querySelector('#planGo');button.disabled=true;
 pauseNavigation();stopLiveDrive();
 planStatus.textContent='Finding locations and planning with Valhalla + HDE...';
 try {
  const response=await fetch('/api/navidrive/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({start:gpsStart || startInput.value,destination:document.querySelector('#journeyDestination').value}),signal:AbortSignal.timeout(120000)});
  const result=await response.json();if(!response.ok) throw Error(result.error || 'Route planning failed.');
  const route={id:createNavigationId(),name:(result.start.label || startInput.value)+' → '+(result.destination.label || document.querySelector('#journeyDestination').value),points:result.geometry,matchedPoints:[],planned:result};
  routes.unshift(route);renderRouteOptions();routeSelect.value=route.id;await loadSelectedRoute();
  planStatus.textContent=result.engine+': '+result.explanation+' Check the resolved locations above, then Replay or Live Drive.';
 }catch(error){planStatus.textContent=error.message;}
 finally{button.disabled=false;}
});

// getRandomValues is available on LAN HTTP, where randomUUID may be absent.
function createNavigationId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0,8), hex.slice(8,12), hex.slice(12,16), hex.slice(16,20), hex.slice(20)].join('-');
}

function setJourneyCollapsed(collapsed) {
 document.body.classList.toggle('journey-collapsed', collapsed);
 const toggle=document.querySelector('#toggleJourney');
 toggle.textContent=collapsed ? 'Edit route ↑' : 'Hide planner ↓';
 toggle.setAttribute('aria-expanded', String(!collapsed));
 // Leave the vehicle in the unobscured map area above the driving controls.
 CAMERA.padding.bottom=collapsed ? 88 : 245;
 CAMERA.lookAheadProgress=collapsed ? 0.008 : 0.018;
 if(mapReady && activeLine.length) updateCamera(latestProgress,true);
}
document.querySelector('#toggleJourney').addEventListener('click',()=>{
 const collapsed=document.body.classList.contains('journey-collapsed');
 setJourneyCollapsed(!collapsed);
 if(collapsed) document.querySelector('#journeyStart').focus({preventScroll:true});
});
