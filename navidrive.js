const ROUTES_API = "/api/routes";
const NAVIDRIVE_ROUTE_API = "/api/navidrive-route";

const routeSelect = document.querySelector("#naviRouteSelect");
const routeMeta = document.querySelector("#naviRouteMeta");
const speedReadout = document.querySelector("#naviSpeed");
const modeLabel = document.querySelector("#naviMode");
const instructionLabel = document.querySelector("#naviInstruction");
const distanceLabel = document.querySelector("#naviDistance");
const cuePreview = document.querySelector("#naviCuePreview");
const startButton = document.querySelector("#naviStart");
const briefButton = document.querySelector("#naviBrief");
const stopButton = document.querySelector("#naviStop");
const fitRouteButton = document.querySelector("#naviFitRoute");
const approachGauge = document.querySelector("#cueApproachGauge");
const tripProgressFill = document.querySelector("#tripProgressFill");

const map = L.map("naviMap", { zoomControl: true }).setView([22.3193, 114.1694], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

let routes = [];
let activeRoute = null;
let routeLine = null;
let recordedLine = null;
let cueLayer = L.layerGroup().addTo(map);
let taxiMarker = null;
let nextCueLine = null;
let liveWatchId = null;
let simulationTimer = null;
let simulationIndex = 0;
let lastPosition = null;
let routeProgressMeters = 0;
let routeProgressRouteId = "";
let naviDriveEngine = "saved";

function setStatus(mode, instruction, distance = "") {
  modeLabel.textContent = mode;
  instructionLabel.textContent = instruction;
  distanceLabel.textContent = distance;
}

function setButtons(activeMode = "idle") {
  startButton.classList.toggle("is-active", activeMode === "drive");
  briefButton.classList.toggle("is-active", activeMode === "brief");
  stopButton.classList.toggle("is-active", false);
  startButton.disabled = activeMode !== "idle";
  briefButton.disabled = activeMode !== "idle";
  stopButton.disabled = activeMode === "idle";
}

function parseLatLngPoint(point) {
  if (Array.isArray(point)) {
    return [Number(point[0]), Number(point[1])];
  }
  if (typeof point === "string") {
    const parts = point.trim().split(/[,\s]+/).map(Number);
    return [parts[0], parts[1]];
  }
  return [Number(point?.latitude), Number(point?.longitude)];
}

function parseGeometry(route) {
  const naviGeometry = Array.isArray(route?.naviDriveGeometry) ? route.naviDriveGeometry : [];
  const fromNaviGeometry = naviGeometry
    .map(parseLatLngPoint)
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (fromNaviGeometry.length >= 2) {
    return fromNaviGeometry;
  }

  const geometry = Array.isArray(route?.routeGeometry) ? route.routeGeometry : [];
  const fromGeometry = geometry
    .map(parseLatLngPoint)
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (fromGeometry.length >= 2) {
    return fromGeometry;
  }

  return (route?.recordedTrackPoints || [])
    .map(parseLatLngPoint)
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function getLocatedCues(route) {
  return (route?.photos || [])
    .filter((cue) => Number.isFinite(Number(cue.latitude)) && Number.isFinite(Number(cue.longitude)))
    .sort((a, b) => (Number(a.step) || 0) - (Number(b.step) || 0));
}

function distanceMeters(first, second) {
  return map.distance(L.latLng(first[0], first[1]), L.latLng(second[0], second[1]));
}

function formatMeters(meters) {
  if (!Number.isFinite(meters)) {
    return "";
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatSpeed(position) {
  const speed = Number(position?.coords?.speed);
  if (Number.isFinite(speed) && speed >= 0) {
    return Math.round(speed * 3.6);
  }
  return "--";
}

function routeDistance(points) {
  return points.slice(1).reduce((total, point, index) => total + distanceMeters(points[index], point), 0);
}

function sampleRouteEnginePoints(points, maxPoints = 10) {
  if (points.length <= maxPoints) {
    return points;
  }

  return Array.from({ length: maxPoints }, (_, index) => {
    const sourceIndex = Math.round(index * (points.length - 1) / (maxPoints - 1));
    return points[sourceIndex];
  });
}

function projectOntoSegment(point, start, end) {
  const latScale = 111320;
  const lngScale = Math.cos((point[0] * Math.PI) / 180) * 111320;
  const px = point[1] * lngScale;
  const py = point[0] * latScale;
  const ax = start[1] * lngScale;
  const ay = start[0] * latScale;
  const bx = end[1] * lngScale;
  const by = end[0] * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const projected = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
  return {
    point: projected,
    distance: distanceMeters(point, projected),
    progressOnSegment: t
  };
}

function projectOntoRoute(point, routePoints) {
  let best = null;
  let progressBefore = 0;
  let travelled = 0;

  for (let index = 0; index < routePoints.length - 1; index += 1) {
    const segmentStart = routePoints[index];
    const segmentEnd = routePoints[index + 1];
    const segmentLength = distanceMeters(segmentStart, segmentEnd);
    const projection = projectOntoSegment(point, segmentStart, segmentEnd);
    if (!best || projection.distance < best.distance) {
      best = {
        ...projection,
        segmentIndex: index,
        progressMeters: travelled + segmentLength * projection.progressOnSegment
      };
    }
    travelled += segmentLength;
    progressBefore = travelled;
  }

  return best || { point: routePoints[0], distance: 0, segmentIndex: 0, progressMeters: progressBefore };
}

function cueIcon(cue) {
  return L.divIcon({
    className: "",
    html: `<div class="navi-cue-icon">${Number(cue.step) || ""}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

function taxiIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="navi-taxi-marker"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

function renderGauge(distanceToCue) {
  const maxDistance = 350;
  const filled = Number.isFinite(distanceToCue)
    ? Math.max(0, Math.min(14, Math.round((1 - Math.min(distanceToCue, maxDistance) / maxDistance) * 14)))
    : 0;
  approachGauge.innerHTML = Array.from({ length: 14 }, (_, index) =>
    `<span class="${index < filled ? "is-filled" : ""}"></span>`
  ).join("");
}

function renderCuePreview(cue, distanceToCue) {
  if (!cue) {
    cuePreview.innerHTML = '<div class="empty-cue">Next cue photo appears here.</div>';
    return;
  }

  const image = cue.image ? `<img src="${cue.image}" alt="">` : "";
  const instruction = cue.instruction || cue.title || `Step ${cue.step}`;
  cuePreview.innerHTML = `
    ${image}
    <div>
      <strong>${escapeHtml(instruction)}</strong>
      <span>${formatMeters(distanceToCue)} to cue</span>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function drawRoute(route) {
  cueLayer.clearLayers();
  if (routeLine) routeLine.remove();
  if (recordedLine) recordedLine.remove();
  if (nextCueLine) nextCueLine.remove();
  nextCueLine = null;

  const geometry = parseGeometry(route);
  if (geometry.length >= 2) {
    routeLine = L.polyline(geometry, { color: "#d47a24", weight: 7, opacity: 0.86 }).addTo(map);
  }

  const recorded = (route?.recordedTrackPoints || [])
    .map((point) => [Number(point.latitude), Number(point.longitude)])
    .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  if (recorded.length >= 2) {
    recordedLine = L.polyline(recorded, { color: "#147a54", weight: 5, opacity: 0.86 }).addTo(map);
  }

  getLocatedCues(route).forEach((cue) => {
    L.marker([Number(cue.latitude), Number(cue.longitude)], { icon: cueIcon(cue) })
      .bindTooltip(cue.instruction || cue.title || `Cue ${cue.step}`)
      .addTo(cueLayer);
  });

  fitRoute();
}

function fitRoute() {
  const layers = [];
  if (routeLine) layers.push(routeLine);
  if (recordedLine) layers.push(recordedLine);
  cueLayer.eachLayer((layer) => layers.push(layer));
  if (taxiMarker) layers.push(taxiMarker);
  if (!layers.length) return;
  map.fitBounds(L.featureGroup(layers).getBounds(), { padding: [28, 28], maxZoom: 17 });
}

function updateRouteMeta(route) {
  const cues = getLocatedCues(route);
  const geometry = parseGeometry(route);
  const type = route.routeType === "hybrid" ? "Hybrid route" : route.recordedTrackPoints?.length ? "Recorded road" : "Saved route";
  const engine = naviDriveEngine === "valhalla" ? "NaviDrive: Valhalla" : "NaviDrive: saved line";
  routeMeta.textContent = `${engine}. ${type}. ${geometry.length} route points. ${cues.length} cue photos.`;
}

async function applyValhallaNaviDriveRoute(route) {
  naviDriveEngine = "saved";
  const baseGeometry = parseGeometry({ ...route, naviDriveGeometry: [] });

  if (baseGeometry.length < 2) {
    return;
  }

  const response = await fetch(NAVIDRIVE_ROUTE_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      points: sampleRouteEnginePoints(baseGeometry),
      costing: "taxi"
    })
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.ok || !result.route?.geometry?.length) {
    throw new Error(result.error || "Valhalla NaviDrive route is unavailable.");
  }

  route.naviDriveGeometry = result.route.geometry;
  route.naviDriveCues = result.route.cues || [];
  naviDriveEngine = result.route.engine || "valhalla";
}

async function loadRoutes() {
  const response = await fetch(`${ROUTES_API}?images=0`, { cache: "no-store" });
  routes = await response.json();
  routeSelect.innerHTML = routes.length
    ? routes.map((route) => `<option value="${route.id}">${escapeHtml(route.name)} -> ${escapeHtml(route.destination || "Destination")}</option>`).join("")
    : '<option value="">No saved routes</option>';
  if (!routes.length) {
    setStatus("No Routes", "No saved routes found.");
    routeMeta.textContent = "Open TaxiBo Cue and save or sync routes first.";
    return;
  }
  await loadRoute(routeSelect.value || routes[0].id);
}

async function loadRoute(routeId) {
  stopNavi(false);
  const response = await fetch(`${ROUTES_API}/${encodeURIComponent(routeId)}`, { cache: "no-store" });
  const result = await response.json();
  if (!response.ok || !result.ok || !result.route) {
    throw new Error(result.error || "Could not load this route.");
  }
  activeRoute = result.route;
  routeProgressRouteId = "";
  routeProgressMeters = 0;
  try {
    setStatus("Valhalla", "Preparing NaviDrive route line...", "");
    await applyValhallaNaviDriveRoute(activeRoute);
  } catch (error) {
    naviDriveEngine = "saved";
    console.warn(error);
  }
  drawRoute(activeRoute);
  updateRouteMeta(activeRoute);
  renderGauge(null);
  renderCuePreview(getLocatedCues(activeRoute)[0], null);
  setStatus("Ready", "Route loaded. Press Drive for live GPS or Brief for laptop test.", `${getLocatedCues(activeRoute).length} cues`);
}

function nearestUpcomingCue(route, positionPoint, progressMeters) {
  const cues = getLocatedCues(route);
  if (!cues.length) return null;
  const geometry = parseGeometry(route);
  const cuesWithProgress = cues.map((cue) => {
    const cuePoint = [Number(cue.latitude), Number(cue.longitude)];
    const cueProjection = geometry.length >= 2 ? projectOntoRoute(cuePoint, geometry) : null;
    const directDistance = distanceMeters(positionPoint, cuePoint);
    return {
      cue,
      distance: directDistance,
      progressMeters: cueProjection?.progressMeters ?? 0
    };
  });
  return cuesWithProgress.find((item) => item.progressMeters + 35 >= progressMeters)
    || cuesWithProgress.at(-1);
}

function updatePosition(position) {
  if (!activeRoute) return;
  lastPosition = position;
  const current = [position.coords.latitude, position.coords.longitude];
  const geometry = parseGeometry(activeRoute);
  const totalDistance = routeDistance(geometry);
  const projection = geometry.length >= 2 ? projectOntoRoute(current, geometry) : null;
  if (routeProgressRouteId !== activeRoute.id) {
    routeProgressRouteId = activeRoute.id;
    routeProgressMeters = projection?.progressMeters ?? 0;
  } else {
    routeProgressMeters = Math.max(routeProgressMeters, projection?.progressMeters ?? 0);
  }

  const next = nearestUpcomingCue(activeRoute, current, routeProgressMeters);
  const distanceToCue = next ? distanceMeters(current, [Number(next.cue.latitude), Number(next.cue.longitude)]) : null;
  const progressPercent = totalDistance > 0 ? Math.max(0, Math.min(100, (routeProgressMeters / totalDistance) * 100)) : 0;
  tripProgressFill.style.width = `${progressPercent}%`;
  speedReadout.textContent = formatSpeed(position);
  renderGauge(distanceToCue);
  renderCuePreview(next?.cue, distanceToCue);

  if (!taxiMarker) {
    taxiMarker = L.marker(current, { icon: taxiIcon() }).addTo(map);
  } else {
    taxiMarker.setLatLng(current);
  }

  if (next?.cue) {
    const cuePoint = [Number(next.cue.latitude), Number(next.cue.longitude)];
    if (!nextCueLine) {
      nextCueLine = L.polyline([current, cuePoint], { color: "#1f78ff", weight: 4, dashArray: "8 8" }).addTo(map);
    } else {
      nextCueLine.setLatLngs([current, cuePoint]);
    }
    setStatus("Driving", next.cue.instruction || next.cue.title || `Cue ${next.cue.step}`, `${formatMeters(distanceToCue)} to cue`);
  } else {
    setStatus("Driving", "No more cue photos on this route.", `${Math.round(progressPercent)}% complete`);
  }

  map.panTo(current, { animate: true, duration: 0.25 });
}

function startDrive() {
  if (!activeRoute) {
    setStatus("No Route", "Choose a saved route before Drive.");
    return;
  }
  if (!window.isSecureContext) {
    setStatus("GPS Blocked", "Use HTTPS or localhost so the browser allows live GPS.");
    return;
  }
  if (!navigator.geolocation) {
    setStatus("No GPS", "This browser does not support live GPS.");
    return;
  }
  stopNavi(false);
  setButtons("drive");
  setStatus("Starting", "Requesting live GPS permission...");
  liveWatchId = navigator.geolocation.watchPosition(
    updatePosition,
    (error) => {
      setStatus("GPS Error", error.message || "Could not read live GPS.");
      stopNavi(false);
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
  );
}

function createSimulatedPosition(point) {
  return {
    coords: {
      latitude: point[0],
      longitude: point[1],
      accuracy: 10,
      speed: 13.9
    },
    timestamp: Date.now()
  };
}

function startBrief() {
  if (!activeRoute) {
    setStatus("No Route", "Choose a saved route before Brief.");
    return;
  }
  const geometry = parseGeometry(activeRoute);
  if (geometry.length < 2) {
    setStatus("No Line", "This route has no route line to brief.");
    return;
  }

  stopNavi(false);
  setButtons("brief");
  simulationIndex = 0;
  const tick = () => {
    updatePosition(createSimulatedPosition(geometry[simulationIndex]));
    simulationIndex += 1;
    if (simulationIndex >= geometry.length) {
      stopNavi(false);
      setStatus("Complete", "Brief reached the end of the route.");
      return;
    }
    simulationTimer = window.setTimeout(tick, 650);
  };
  tick();
}

function stopNavi(showStatus = true) {
  if (liveWatchId !== null) {
    navigator.geolocation.clearWatch(liveWatchId);
    liveWatchId = null;
  }
  if (simulationTimer !== null) {
    window.clearTimeout(simulationTimer);
    simulationTimer = null;
  }
  simulationIndex = 0;
  setButtons("idle");
  if (showStatus) {
    setStatus("Idle", "Navigation stopped. Choose Drive or Brief to continue.");
  }
}

routeSelect.addEventListener("change", () => {
  loadRoute(routeSelect.value).catch((error) => setStatus("Load Error", error.message));
});
startButton.addEventListener("click", startDrive);
briefButton.addEventListener("click", startBrief);
stopButton.addEventListener("click", () => stopNavi(true));
fitRouteButton.addEventListener("click", fitRoute);

renderGauge(null);
setButtons("idle");
loadRoutes().catch((error) => {
  setStatus("Load Error", error.message || "Could not load saved routes.");
  routeMeta.textContent = "Check the TaxiBo server and database connection.";
});
