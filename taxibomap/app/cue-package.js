// Cue geometry arrays use latitude/longitude; GeoJSON uses longitude/latitude.
export function parseCuePackage(value) {
  if (value?.format !== 'taxibo-cue-route' || value.version !== 1 || !value.route) throw new Error('Choose a TaxiBo Cue route package (version 1).');
  const { photos, ...route } = value.route;
  const source = route.routeGeometry?.length >= 2 ? route.routeGeometry : route.recordedTrackPoints;
  if (!Array.isArray(source) || source.length < 2 || source.length > 100000) throw new Error('Route needs 2–100,000 geometry points.');
  const points = source.map(p => {
    const pair = typeof p === 'string' ? p.trim().split(/[,\s]+/) : p;
    const latitude = Number(Array.isArray(pair) ? pair[0] : pair?.latitude);
    const longitude = Number(Array.isArray(pair) ? pair[1] : pair?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 22.13 || latitude > 22.58 || longitude < 113.80 || longitude > 114.45) throw new Error('Route contains invalid or out-of-Hong-Kong coordinates.');
    return { latitude, longitude };
  });
  if (!points.some(p => p.latitude !== points[0].latitude || p.longitude !== points[0].longitude)) throw new Error('Route has no travel distance.');
  return { id: `cue-${String(route.id || 'imported')}`, name: String(route.name || route.destination || 'Cue route'), points, matchedPoints: [], reviewStatus: 'imported', matchStatus: 'cue geometry', trustScore: 0, cuePackage: { ...value, route } };
}
