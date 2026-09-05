"""Read Cue's local knowledge; route exclusively through local Valhalla."""
import importlib.util
import json
import os
import sys
from urllib.request import Request, urlopen

def main():
    payload = json.load(sys.stdin)
    spec = importlib.util.spec_from_file_location('cue_hde', os.environ['TAXIBO_CUE_SERVER'])
    cue = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cue)
    cue.USING_POSTGRES = False
    cue.ACTIVE_STORAGE_MODE.set('local')
    # The bridge never creates or updates Cue's database.
    import sqlite3
    def read_db():
        db = sqlite3.connect(cue.DB_PATH.as_uri() + '?mode=ro', uri=True)
        db.row_factory = sqlite3.Row
        return db
    cue.connect_db = read_db

    def valhalla(start, destination, waypoints=None):
        locations = [{'lat': p['latitude'], 'lon': p['longitude'], 'type': 'break'} for p in [start, *(waypoints or []), destination]]
        request = Request(os.environ.get('VALHALLA_URL', 'http://localhost:8002') + '/route', data=json.dumps({'locations': locations, 'costing':'taxi', 'format':'osrm', 'shape_format':'geojson', 'directions_type':'maneuvers'}).encode(), headers={'Content-Type':'application/json'})
        with urlopen(request, timeout=15) as response:
            route = json.load(response)['routes'][0]
        return {'geometry': [[lat, lon] for lon, lat in route['geometry']['coordinates']], 'distance':route['distance'], 'duration':route['duration'], 'cues':cue.extract_turn_cues(route)}
    cue.fetch_road_route = valhalla
    if payload['action'] == 'geocode':
        point = cue.geocode_place(payload['query'])
        if not cue.is_in_hong_kong_bounds(point['latitude'], point['longitude']):
            raise ValueError('Choose a location inside Hong Kong.')
        return point
    if os.environ.get('TAXIBO_HDE_ROUTES'):
        with open(os.environ['TAXIBO_HDE_ROUTES'], encoding='utf-8') as source:
            knowledge = json.load(source)
        if not isinstance(knowledge, list):
            raise ValueError('HDE knowledge must be a route list.')
        cue.fetch_routes = lambda **kwargs: knowledge
    generated = payload['route']
    candidate = cue.build_best_hybrid_route(generated)
    return {'candidate': candidate if cue.should_promote_hybrid_route(candidate) else None}

if __name__ == '__main__':
    try:
        print(json.dumps(main(), ensure_ascii=True))
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
