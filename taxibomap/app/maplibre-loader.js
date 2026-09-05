const MAPLIBRE_SOURCES = [
  {
    css: "https://cdn.jsdelivr.net/npm/maplibre-gl/dist/maplibre-gl.css",
    js: "https://cdn.jsdelivr.net/npm/maplibre-gl/dist/maplibre-gl.js"
  },
  {
    css: "https://unpkg.com/maplibre-gl/dist/maplibre-gl.css",
    js: "https://unpkg.com/maplibre-gl/dist/maplibre-gl.js"
  },
  {
    css: "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.css",
    js: "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/4.7.1/maplibre-gl.js"
  }
];

loadMapLibreThenNavigation();

async function loadMapLibreThenNavigation() {
  const status = document.querySelector("#routeStatus");
  const distance = document.querySelector("#nextDistance");
  const instruction = document.querySelector("#nextInstruction");

  for (const source of MAPLIBRE_SOURCES) {
    try {
      await loadStylesheet(source.css);
      await loadScript(source.js);
      if (window.maplibregl) {
        await loadScript(document.querySelector("script[data-navigation]")?.dataset.navigation || "navigate.js");
        return;
      }
    } catch {
      removeStylesheet(source.css);
    }
  }

  if (distance) distance.textContent = "Map unavailable";
  if (instruction) instruction.textContent = "MapLibre did not load";
  if (status) status.textContent = "Your browser cannot reach the MapLibre CDN. Check internet access, then press Ctrl+F5.";
}

function loadStylesheet(href) {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = resolve;
    link.onerror = reject;
    document.head.append(link);
  });
}

function removeStylesheet(href) {
  document.querySelectorAll(`link[href="${href}"]`).forEach((link) => link.remove());
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.body.append(script);
  });
}
