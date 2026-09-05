const STORAGE_KEY = "taxiboStreetMapRoutesV2";
const HK_CENTER = [114.1694, 22.3193];
const DRIVE_CAMERA = {
  simulator: {
    zoom: 19.05,
    pitch: 78,
    aheadProgress: 0.018,
    duration: 90,
    padding: { top: 120, right: 20, bottom: 540, left: 20 }
  },
  street: {
    zoom: 18.2,
    pitch: 72,
    aheadProgress: 0.026,
    duration: 120,
    padding: { top: 100, right: 24, bottom: 430, left: 24 }
  },
  overview: {
    zoom: 16.4,
    pitch: 58,
    aheadProgress: 0.04,
    duration: 180,
    padding: { top: 80, right: 40, bottom: 260, left: 40 }
  }
};

const routeSelect = document.querySelector("#routeSelect");
const loadRouteButton = document.querySelector("#loadRoute");
const playDriveButton = document.querySelector("#playDrive");
const pauseDriveButton = document.querySelector("#pauseDrive");
const resetDriveButton = document.querySelector("#resetDrive");
const followCameraInput = document.querySelector("#followCamera");
const showRawInput = document.querySelector("#showRaw");
const showMatchedInput = document.querySelector("#showMatched");
const showBuildingsInput = document.querySelector("#showBuildings");
const cameraModeInput = document.querySelector("#cameraMode");
const driveProgress = document.querySelector("#driveProgress");
const driveSpeed = document.querySelector("#driveSpeed");
const driveStatus = document.querySelector("#driveStatus");
const routeTitle = document.querySelector("#routeTitle");
const routeMeta = document.querySelector("#routeMeta");

const map = new maplibregl.Map({
  container: "driveMap",
  center: HK_CENTER,
  zoom: 13,
  pitch: 64,
  bearing: -18,
  attributionControl: true,
  style: {
    version: 8,
    sources: {
      osmRaster: {
        type: "raster",
        tiles: ["https://a.tile.openstreetmap.org/{z}/{x}/{y}.png", "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png", "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: "&copy; OpenStreetMap"
      }
    },
    layers: [
      {
        id: "osmRaster",
        type: "raster",
        source: "osmRaster"
      }
    ]
  }
});

let routes = [];
let activeRoute = null;
let activeLine = [];
let cumulative = [];
let animationId = null;
let startedAt = 0;
let pausedAt = 0;
let durationMs = 24000;
let buildingLoadTimer = null;

map.on("load", async () => {
  addRouteLayers();
  loadBuildingsForViewport();
  routes = await loadRoutes();
  renderRouteOptions();
  if (routes.length) {
    routeSelect.value = routes[0].id;
    loadSelectedRoute();
  }
});

loadRouteButton.addEventListener("click", loadSelectedRoute);
playDriveButton.addEventListener("click", playDrive);
pauseDriveButton.addEventListener("click", pauseDrive);
resetDriveButton.addEventListener("click", resetDrive);
showRawInput.addEventListener("change", updateLayerVisibility);
showMatchedInput.addEventListener("change", updateLayerVisibility);
showBuildingsInput.addEventListener("change", updateLayerVisibility);
cameraModeInput.addEventListener("change", () => jumpToProgress(currentProgress()));
map.on("moveend", () => {
  window.clearTimeout(buildingLoadTimer);
  buildingLoadTimer = window.setTimeout(loadBuildingsForViewport, 180);
});

async function loadRoutes() {
  try {
    const response = await fetch("/api/routes");
    if (!response.ok) throw new Error("API routes unavailable.");
    const apiRoutes = await response.json();
    return apiRoutes.map(normalizeRoute).filter((route) => route.points.length >= 2);
  } catch {
    return loadLocalRoutes();
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

function renderRouteOptions() {
  routeSelect.innerHTML = "";
  if (!routes.length) {
    routeSelect.innerHTML = `<option>No saved routes</option>`;
    setStatus("No routes found. Save or load a route in the recorder first.");
    return;
  }

  for (const route of routes) {
    const option = document.createElement("option");
    option.value = route.id;
    option.textContent = `${route.name} (${route.matchStatus})`;
    routeSelect.append(option);
  }
}

function loadSelectedRoute() {
  const route = routes.find((item) => item.id === routeSelect.value);
  if (!route) return;

  pauseDrive();
  activeRoute = route;
  activeLine = route.matchedPoints.length ? route.matchedPoints : route.points;
  cumulative = buildCumulativeDistances(activeLine);
  durationMs = Math.max(14000, Math.min(45000, totalLineDistance(activeLine) * 2.6));
  updateRouteSources(route);
  updateLayerVisibility();
  routeTitle.textContent = route.name;
  routeMeta.textContent = `${route.matchedPoints.length ? "Matched road line" : "Raw GPS line"} | ${route.points.length} GPS points | ${formatDistance(route.distanceMeters)}`;
  setStatus(route.matchedPoints.length ? "Matched route loaded for 2.5D review." : "Only raw GPS route is available. Use Match in the recorder for better review.");
  jumpToProgress(0);
  fitToLine(activeLine);
}

function addRouteLayers() {
  map.addSource("rawRoute", emptyLineSource());
  map.addSource("matchedRoute", emptyLineSource());
  map.addSource("driverPoint", pointSource(HK_CENTER));
  map.addSource("buildings", {
    type: "geojson",
    data: emptyFeatureCollection()
  });

  map.addLayer({
    id: "buildings3d",
    type: "fill-extrusion",
    source: "buildings",
    minzoom: 14,
    paint: {
      "fill-extrusion-color": [
        "interpolate",
        ["linear"],
        ["get", "height"],
        6,
        "#d8d3c8",
        60,
        "#b8c0b6",
        140,
        "#8d9b96"
      ],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.66
    }
  });

  map.addLayer({
    id: "rawRoute",
    type: "line",
    source: "rawRoute",
    paint: {
      "line-color": "#d78a1f",
      "line-width": 7,
      "line-opacity": 0.62,
      "line-dasharray": [1, 1.25]
    }
  });

  map.addLayer({
    id: "matchedRoute",
    type: "line",
    source: "matchedRoute",
    paint: {
      "line-color": "#b33939",
      "line-width": 8,
      "line-opacity": 0.9
    }
  });

  map.addLayer({
    id: "driverHalo",
    type: "circle",
    source: "driverPoint",
    paint: {
      "circle-radius": 18,
      "circle-color": "#087450",
      "circle-opacity": 0.18
    }
  });

  map.addLayer({
    id: "driverPoint",
    type: "circle",
    source: "driverPoint",
    paint: {
      "circle-radius": 8,
      "circle-color": "#087450",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 3
    }
  });
}

function updateRouteSources(route) {
  map.getSource("rawRoute").setData(lineFeature(route.points));
  map.getSource("matchedRoute").setData(lineFeature(route.matchedPoints));
}

function updateLayerVisibility() {
  map.setLayoutProperty("rawRoute", "visibility", showRawInput.checked ? "visible" : "none");
  map.setLayoutProperty("matchedRoute", "visibility", showMatchedInput.checked ? "visible" : "none");
  map.setLayoutProperty("buildings3d", "visibility", showBuildingsInput.checked ? "visible" : "none");
}

async function loadBuildingsForViewport() {
  if (!map.getSource("buildings")) return;

  const bounds = map.getBounds();
  const bbox = [
    bounds.getWest().toFixed(6),
    bounds.getSouth().toFixed(6),
    bounds.getEast().toFixed(6),
    bounds.getNorth().toFixed(6)
  ].join(",");

  try {
    const response = await fetch(`/api/buildings?bbox=${bbox}`);
    if (!response.ok) throw new Error("Building data unavailable.");
    const geojson = await response.json();
    map.getSource("buildings").setData(geojson);
  } catch {
    map.getSource("buildings").setData(emptyFeatureCollection());
  }
}

function playDrive() {
  if (!activeRoute || activeLine.length < 2) {
    setStatus("Load a route before starting the 2.5D drive.");
    return;
  }

  if (!pausedAt) {
    startedAt = performance.now();
  } else {
    startedAt = performance.now() - pausedAt;
  }
  pausedAt = 0;
  animationId = requestAnimationFrame(tickDrive);
}

function pauseDrive() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
    pausedAt = performance.now() - startedAt;
  }
}

function resetDrive() {
  pauseDrive();
  pausedAt = 0;
  jumpToProgress(0);
}

function tickDrive(now) {
  const elapsed = now - startedAt;
  const progress = Math.min(1, elapsed / durationMs);
  jumpToProgress(progress);

  if (progress < 1) {
    animationId = requestAnimationFrame(tickDrive);
  } else {
    animationId = null;
    pausedAt = 0;
    setStatus("2.5D test drive complete.");
  }
}

function jumpToProgress(progress) {
  if (!activeLine.length) return;

  const current = pointAtProgress(activeLine, cumulative, progress);
  const camera = activeCamera();
  const next = pointAtProgress(activeLine, cumulative, Math.min(1, progress + camera.aheadProgress));
  const bearing = bearingBetween(current, next);
  map.getSource("driverPoint").setData(pointFeature([current.longitude, current.latitude]));
  driveProgress.textContent = `${Math.round(progress * 100)}%`;
  driveSpeed.textContent = String(Math.round((totalLineDistance(activeLine) / durationMs) * 3600));

  if (followCameraInput.checked) {
    map.easeTo({
      center: [current.longitude, current.latitude],
      zoom: camera.zoom,
      pitch: camera.pitch,
      bearing,
      padding: camera.padding,
      duration: camera.duration,
      easing: (t) => t
    });
  }
}

function currentProgress() {
  if (!startedAt || !durationMs) return 0;
  return Math.min(1, Math.max(0, (performance.now() - startedAt) / durationMs));
}

function activeCamera() {
  return DRIVE_CAMERA[cameraModeInput.value] || DRIVE_CAMERA.simulator;
}

function fitToLine(points) {
  const bounds = new maplibregl.LngLatBounds();
  for (const point of points) bounds.extend([point.longitude, point.latitude]);
  map.fitBounds(bounds, { padding: 90, pitch: 60, duration: 600 });
}

function normalizeRoute(route) {
  const points = normalizePoints(route.points);
  const matchedPoints = normalizePoints(route.matchedPoints || route.matchedGeometry);
  return {
    id: String(route.id || crypto.randomUUID()),
    name: String(route.name || "Untitled route"),
    points,
    matchedPoints,
    matchStatus: String(route.matchStatus || (matchedPoints.length ? "matched" : "pending")),
    distanceMeters: Number(route.distanceMeters || totalLineDistance(points))
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

function buildCumulativeDistances(points) {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(distances[index - 1] + distanceMeters(points[index - 1], points[index]));
  }
  return distances;
}

function pointAtProgress(points, distances, progress) {
  const target = distances[distances.length - 1] * progress;
  for (let index = 1; index < distances.length; index += 1) {
    if (distances[index] >= target) {
      const segmentDistance = distances[index] - distances[index - 1] || 1;
      const local = (target - distances[index - 1]) / segmentDistance;
      return interpolate(points[index - 1], points[index], local);
    }
  }
  return points[points.length - 1];
}

function interpolate(first, second, amount) {
  return {
    latitude: first.latitude + (second.latitude - first.latitude) * amount,
    longitude: first.longitude + (second.longitude - first.longitude) * amount
  };
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
    geometry: {
      type: "LineString",
      coordinates: points.map((point) => [point.longitude, point.latitude])
    },
    properties: {}
  };
}

function pointFeature(coordinates) {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates
    },
    properties: {}
  };
}

function emptyLineSource() {
  return {
    type: "geojson",
    data: lineFeature([])
  };
}

function emptyFeatureCollection() {
  return {
    type: "FeatureCollection",
    features: []
  };
}

function pointSource(coordinates) {
  return {
    type: "geojson",
    data: pointFeature(coordinates)
  };
}

function formatDistance(meters) {
  return `${(Number(meters || 0) / 1000).toFixed(1)} km`;
}

function setStatus(message) {
  driveStatus.textContent = message;
}
