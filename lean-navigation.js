// Outdoor routing over the collision product already admitted by the game.
// A 20-unit A* grid respects blocked terrain, object walls and linked portals.
// Native movement remains the final authority for height and collision response.
const Navigation = {
  scene: null, revision: 0, error: '',
  bytes(value, size) {
    const raw = atob(value), out = Uint8Array.from(raw, c => c.charCodeAt(0));
    if (out.length !== size) throw Error('Invalid navigation grid');
    return out;
  },
  capture(command) {
    const c = command?.command || command;
    if (c?.kind !== 'navigation') return;
    try { this.install(c.bundle); } catch (e) { this.scene = null; this.error = e.message; Log.warn('Walk-back navigation: ' + e.message); }
  },
  install(product) {
    if (!product?.complete || (product.regionId & DUNGEON)) throw Error('Outdoor collision data required');
    const nav = product.navmesh;
    if (nav?.tileSize !== 20 || nav.regionSize !== SECTOR || nav.tilesPerAxis !== 96) throw Error('Unsupported collision data');
    const scene = { regionId: product.regionId, grids: new Map(), walls: new Map() };
    for (const row of nav.regions || []) {
      if (Math.abs(row.dx) > 1 || Math.abs(row.dz) > 1) throw Error('Invalid collision coverage');
      scene.grids.set(row.dx + ',' + row.dz, { blocked: this.bytes(row.blockedTiles, 9216),
        cells: new DataView(this.bytes(row.tileCellIds, 36864).buffer), count: row.cells.count });
    }
    const add = wall => {
      const minX = Math.floor((Math.min(wall[0], wall[2]) - 2) / 80), maxX = Math.floor((Math.max(wall[0], wall[2]) + 2) / 80);
      const minZ = Math.floor((Math.min(wall[1], wall[3]) - 2) / 80), maxZ = Math.floor((Math.max(wall[1], wall[3]) + 2) / 80);
      if ((maxX - minX + 1) * (maxZ - minZ + 1) > 10000) throw Error('Oversized collision wall');
      for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) {
        const key = x + ',' + z;
        if (!scene.walls.has(key)) scene.walls.set(key, []);
        scene.walls.get(key).push(wall);
      }
    };
    for (const p of product.objects || []) {
      const m = p.mesh;
      if (!m || m.passThrough) continue;
      const linked = new Set((p.links || []).map(l => l.edge));
      const vertex = id => {
        const x = m.vertices[id * 3], z = m.vertices[id * 3 + 2], c = Math.cos(p.yaw), s = Math.sin(p.yaw);
        return [c * x - s * z + p.x, s * x + c * z + p.z];
      };
      for (let i = 0; i < m.edges.length; i += 6) {
        const outline = m.edges[i + 5] === 0, flags = m.edges[i + 4];
        if (outline && (flags & 8) && linked.has(i / 6)) continue;
        // One-way native borders are treated conservatively as walls by the planner.
        if (!outline && !(flags & 3)) continue;
        add([...vertex(m.edges[i]), ...vertex(m.edges[i + 1])]);
      }
    }
    this.scene = scene; this.error = ''; this.revision++;
  },
  local(p) {
    const d = regionDelta({ regionId: this.scene.regionId, x: 0, z: 0 }, p);
    return d && { x: d[0], z: d[1] };
  },
  pose(p, y) {
    const sx = Math.floor(p.x / SECTOR), sz = Math.floor(p.z / SECTOR);
    return { regionId: ((this.scene.regionId & 255) + sx) | (((this.scene.regionId >>> 8) + sz) << 8),
      x: p.x - sx * SECTOR, z: p.z - sz * SECTOR, y };
  },
  open(x, z) {
    const sx = Math.floor(x / SECTOR), sz = Math.floor(z / SECTOR), grid = this.scene.grids.get(sx + ',' + sz);
    if (!grid) return false;
    const tx = Math.floor((x - sx * SECTOR) / 20), tz = Math.floor((z - sz * SECTOR) / 20), i = tz * 96 + tx;
    return !grid.blocked[i] && grid.cells.getUint32(i * 4, true) < grid.count;
  },
  nearSegment(p, a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, n = dx * dx + dz * dz;
    const t = n ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / n, 0, 1) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
  },
  clear(a, b) {
    const length = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.max(1, Math.ceil(length / 8));
    for (let i = 1; i <= steps; i++) if (!this.open(a.x + (b.x - a.x) * i / steps, a.z + (b.z - a.z) * i / steps)) return false;
    const minX = Math.floor((Math.min(a.x, b.x) - 2) / 80), maxX = Math.floor((Math.max(a.x, b.x) + 2) / 80);
    const minZ = Math.floor((Math.min(a.z, b.z) - 2) / 80), maxZ = Math.floor((Math.max(a.z, b.z) + 2) / 80);
    const cross = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
    const seen = new Set();
    for (let x = minX; x <= maxX; x++) for (let z = minZ; z <= maxZ; z++) for (const w of this.scene.walls.get(x + ',' + z) || []) {
      if (seen.has(w)) continue; seen.add(w);
      const c = { x: w[0], z: w[1] }, d = { x: w[2], z: w[3] };
      const intersects = cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
      if (intersects || Math.min(this.nearSegment(a, c, d), this.nearSegment(b, c, d), this.nearSegment(c, a, b), this.nearSegment(d, a, b)) < 2) return false;
    }
    return true;
  },
  plan(from, to, arrivalRadius = 0) {
    if (!this.scene || (from.regionId | to.regionId) & DUNGEON) return null;
    const start = this.local(from), goal = this.local(to);
    if (!start || !goal || !this.open(start.x, start.z)) return null;
    if (Math.hypot(goal.x - start.x, goal.z - start.z) < 1800 && this.clear(start, goal)) return [to];
    const key = p => p.x + ',' + p.z, center = p => ({ x: p.x * 20 + 10, z: p.z * 20 + 10 });
    const h = p => Math.hypot(center(p).x - goal.x, center(p).z - goal.z) / 20;
    const first = { x: Math.floor(start.x / 20), z: Math.floor(start.z / 20), g: 0, parent: null };
    first.f = h(first); const scores = new Map([[key(first), 0]]), closed = new Set(), heap = [];
    const push = p => { heap.push(p); let i = heap.length - 1; while (i) { const parent = (i - 1) >> 1; if (heap[parent].f <= p.f) break; heap[i] = heap[parent]; i = parent; } heap[i] = p; };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { let i = 0; while (i * 2 + 1 < heap.length) { let c = i * 2 + 1; if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++; if (last.f <= heap[c].f) break; heap[i] = heap[c]; i = c; } heap[i] = last; }
      return top;
    };
    push(first); let best = first, reached = false;
    for (let n = 0; heap.length && n < 60000; n++) {
      const p = pop(), k = key(p); if (closed.has(k)) continue; closed.add(k);
      if (h(p) < h(best)) best = p;
      const a = p === first ? start : center(p);
      if (Math.hypot(a.x - goal.x, a.z - goal.z) <= arrivalRadius) { best = p; reached = true; break; }
      if (h(p) < 2 && this.clear(a, goal)) { best = p; reached = true; break; }
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
        const q = { x: p.x + dx, z: p.z + dz, g: p.g + Math.hypot(dx, dz), parent: p }, b = center(q), qk = key(q);
        if (closed.has(qk) || q.g >= (scores.get(qk) ?? Infinity) || !this.clear(a, b)) continue;
        if (dx && dz && (!this.open(a.x + dx * 20, a.z) || !this.open(a.x, a.z + dz * 20))) continue;
        q.f = q.g + h(q); scores.set(qk, q.g); push(q);
      }
    }
    const goalCovered = this.scene.grids.has(Math.floor(goal.x / SECTOR) + ',' + Math.floor(goal.z / SECTOR));
    if (!reached && (goalCovered || h(first) - h(best) < 2)) return [];
    const path = []; for (let p = best; p && p !== first; p = p.parent) path.push(center(p)); path.reverse();
    if (reached && (!arrivalRadius || Math.hypot(center(best).x - goal.x, center(best).z - goal.z) > arrivalRadius)) path.push(goal);
    // Smooth only segments whose terrain and object collision checks both pass.
    const result = []; let anchor = start;
    for (let i = 0; i < path.length;) {
      let j = i; while (j + 1 < path.length && Math.hypot(path[j + 1].x - anchor.x, path[j + 1].z - anchor.z) < 600 && this.clear(anchor, path[j + 1])) j++;
      result.push(this.pose(path[j], from.y)); anchor = path[j]; i = j + 1;
    }
    return result;
  },
  next(owner, destination, recorded = false, arrivalRadius = 0) {
    const pose = World.pose(), previous = owner.travel;
    if (!this.scene || (pose.regionId & DUNGEON)) {
      return recorded ? { point: destination } : { waiting: true, error: this.error || 'Waiting for game collision data. Reload the game if attached late, or record a walking route.' };
    }
    if (!previous || previous.revision !== this.revision || dist2D(previous.destination, destination) > 1 || previous.index >= previous.route.length) {
      let route = this.plan(pose, destination);
      if (route && !route.length && arrivalRadius > 0) route = this.plan(pose, destination, arrivalRadius);
      if (!route) return { waiting: true, error: 'Waiting for collision coverage at the current position.' };
      if (!route.length) return { error: 'No walkable route found through the loaded collision map.' };
      owner.travel = { destination: { ...destination }, route, index: 0, revision: this.revision };
    }
    const travel = owner.travel;
    while (travel.index < travel.route.length && dist2D(pose, travel.route[travel.index]) <= 7) travel.index++;
    return travel.index < travel.route.length ? { point: travel.route[travel.index] } : { waiting: true };
  },
};
Hook.observers.push(command => Navigation.capture(command));
