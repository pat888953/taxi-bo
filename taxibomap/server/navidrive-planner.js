import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export function cueBridge(payload) {
  return new Promise((resolve, reject) => {
    const python = process.env.TAXIBO_PYTHON || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
    const child = execFile(python, ['-B', fileURLToPath(new URL('./navidrive_bridge.py', import.meta.url))], {
      timeout: 45000, maxBuffer: 8 * 1024 * 1024,
      env: {...process.env, TAXIBO_CUE_SERVER: process.env.TAXIBO_CUE_SERVER || join(homedir(), 'Desktop/Python 2/TAXI Bo/server.py')}
    }, (error, stdout) => {
      try { const result = JSON.parse(stdout); if (error || result.error) reject(new Error(result.error || error.message)); else resolve(result); }
      catch { reject(new Error('Local Cue HDE bridge is unavailable.')); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export function validPoint(p) {
  return p && typeof p.latitude === 'number' && typeof p.longitude === 'number' && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && p.latitude >= 22.13 && p.latitude <= 22.58 && p.longitude >= 113.80 && p.longitude <= 114.45;
}

export function routeFollows(candidate, matched) {
  if (candidate.length < 2 || matched.length < 2) return false;
  // Require the matched route to track the candidate in order, including endpoints.
  const meters = (a,b) => Math.hypot((a[0]-b[0])*111320, (a[1]-b[1])*103000);
  if (meters(candidate[0], matched[0]) > 60 || meters(candidate.at(-1), matched.at(-1)) > 60) return false;
  let cursor = 0;
  for (const point of candidate) {
    let best = cursor, distance = Infinity;
    for (let i=cursor; i<matched.length; i++) {
      const d=meters(point,matched[i]);
      if(d<distance) { best=i; distance=d; }
    }
    if(distance>60) return false;
    cursor=best;
  }
  return true;
}
