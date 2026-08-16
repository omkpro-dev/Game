"""Build an octagon-tile grid over the real world:
 - assign each land tile to a country (point-in-polygon vs Natural Earth borders)
 - give each tile a value (terrain + coastal + real city population + resource deposits)
 - place real population centres from GeoNames
Outputs game_grid.json consumed by the game."""
import json, math, os

D = 1.0                      # cell size in degrees
LAT0, LATBOT = 84.0, -56.0  # visible band (matches map extent, excludes Antarctica)
LON0 = -180.0
COLS = int(round(360 / D))
ROWS = int(round((LAT0 - LATBOT) / D))
CITY_POP_MIN = 200000

def fnv(s):
    h = 2166136261
    for ch in s:
        h ^= ord(ch); h = (h * 16777619) & 0xffffffff
    return h
def rng(seed):
    s = seed & 0xffffffff or 1
    def f():
        nonlocal s
        s ^= (s << 13) & 0xffffffff; s ^= s >> 17; s ^= (s << 5) & 0xffffffff
        return (s & 0xffffffff) / 4294967296
    return f

# ---- decode country polygons in true lon/lat ----
topo = json.load(open('countries-110m.json'))
sx, sy = topo['transform']['scale']; tx, ty = topo['transform']['translate']
raw = topo['arcs']
def dec(a):
    x = y = 0; pts = []
    for dx, dy in a:
        x += dx; y += dy; pts.append((x * sx + tx, y * sy + ty))
    return pts
arcs = [dec(a) for a in raw]
def apts(i): return arcs[i] if i >= 0 else arcs[~i][::-1]
def ring(r):
    pts = []
    for i in r:
        seg = apts(i)
        if pts: seg = seg[1:]
        pts.extend(seg)
    return pts
def unwrap(pts):
    out = []; off = 0.0; prev = None
    for lon, lat in pts:
        if prev is not None:
            dl = (lon + off) - prev
            if dl > 180: off -= 360
            elif dl < -180: off += 360
        nl = lon + off; out.append((nl, lat)); prev = nl
    return out
def bbox(ring):
    xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
    return (min(xs), min(ys), max(xs), max(ys))

countries = []  # {id,name,polys:[{outer,holes,bb}], bb}
for g in topo['objects']['countries']['geometries']:
    name = g['properties']['name']
    if name == 'Antarctica': continue
    cid = g.get('id', name)
    polylist = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
    polys = []
    for poly in polylist:
        rings = [unwrap(ring(r)) for r in poly]
        if not rings or len(rings[0]) < 4: continue
        polys.append({'outer': rings[0], 'holes': rings[1:], 'bb': bbox(rings[0])})
    if not polys: continue
    xs = [p['bb'][0] for p in polys] + [p['bb'][2] for p in polys]
    ys = [p['bb'][1] for p in polys] + [p['bb'][3] for p in polys]
    countries.append({'id': cid, 'name': name, 'polys': polys, 'bb': (min(xs), min(ys), max(xs), max(ys))})

def in_ring(x, y, r):
    inside = False; n = len(r); j = n - 1
    for i in range(n):
        xi, yi = r[i]; xj, yj = r[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside
def in_country(x, y, c):
    for lon in (x, x + 360):
        b = c['bb']
        if lon < b[0] or lon > b[2] or y < b[1] or y > b[3]: continue
        for p in c['polys']:
            pb = p['bb']
            if lon < pb[0] or lon > pb[2] or y < pb[1] or y > pb[3]: continue
            if in_ring(lon, y, p['outer']) and not any(in_ring(lon, y, h) for h in p['holes']):
                return True
    return False

# ---- assign land tiles ----
land = {}   # (col,row) -> country index
print(f'grid {COLS}x{ROWS}, {len(countries)} countries; scanning...')
for row in range(ROWS):
    lat = LAT0 - (row + 0.5) * D
    for col in range(COLS):
        lon = LON0 + (col + 0.5) * D
        for ci, c in enumerate(countries):
            b = c['bb']
            if not ((b[0] <= lon <= b[2] or b[0] <= lon + 360 <= b[2]) and b[1] <= lat <= b[3]):
                continue
            if in_country(lon, lat, c):
                land[(col, row)] = ci
                break
    if row % 20 == 0: print(f'  row {row}/{ROWS} land={len(land)}')
print('land tiles:', len(land))

# ---- coastal detection ----
def is_land(col, row): return (col % COLS, row) in land
coastal = set()
for (col, row) in land:
    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
        nc, nr = col + dx, row + dy
        if nr < 0 or nr >= ROWS or (nc % COLS, nr) not in land:
            coastal.add((col, row)); break

# ---- terrain base value ----
def terrain(col, row):
    lat = LAT0 - (row + 0.5) * D
    a = abs(lat)
    if a > 66: f = 0.35            # arctic
    elif a > 55: f = 0.75
    elif a > 23: f = 1.25          # temperate
    else: f = 1.0                  # tropics
    noise = rng(fnv(f'{col},{row}'))() * 3
    return 3 + f * 3 + noise

value = {}
for (col, row), ci in land.items():
    v = terrain(col, row)
    if (col, row) in coastal: v += 5
    value[(col, row)] = v

# ---- place real cities ----
cities = {}   # (col,row) -> [name, pop]
placed = 0
with open('cities15000.txt', encoding='utf-8') as f:
    for line in f:
        p = line.split('\t')
        try:
            pop = int(p[14]); lat = float(p[4]); lon = float(p[5]); name = p[1]
        except: continue
        if pop < CITY_POP_MIN: continue
        if lat > LAT0 or lat < LATBOT: continue
        col = int((lon - LON0) / D) % COLS
        row = int((LAT0 - lat) / D)
        key = (col, row)
        if key not in land:
            # snap to nearest land tile within 1 ring (coastal cities on water cells)
            best = None
            for dx in (-1,0,1):
                for dy in (-1,0,1):
                    k2 = ((col+dx) % COLS, row+dy)
                    if k2 in land: best = k2; break
                if best: break
            if not best: continue
            key = best
        # city value: sqrt scaling, capped
        cv = min(85, (pop / 45000) ** 0.5 * 6)
        value[key] = value.get(key, 4) + cv
        # metro spillover to neighbours
        for dx in (-1,0,1):
            for dy in (-1,0,1):
                if dx == 0 and dy == 0: continue
                k2 = ((key[0]+dx) % COLS, key[1]+dy)
                if k2 in land: value[k2] = value.get(k2, 4) + cv * 0.18
        if key not in cities or pop > cities[key][1]:
            cities[key] = [name, pop]
        placed += 1
print('city entries placed:', placed, 'labelled tiles:', len(cities))

# ---- resource deposits from country endowment ----
BIAS = {
 'fuel':['Russia','Saudi Arabia','Iran','Iraq','United States of America','Canada','Venezuela','United Arab Emirates','Qatar','Nigeria','Libya','Norway','Kuwait','Kazakhstan','Mexico','Brazil','Angola','Algeria'],
 'energy':['Russia','United States of America','China','Australia','Qatar','Iran','Canada','Indonesia','Turkmenistan'],
 'metals':['Australia','Chile','Peru','China','Russia','Canada','South Africa','Brazil','Indonesia','Dem. Rep. Congo'],
 'uranium':['Kazakhstan','Canada','Australia','Niger','Russia','Namibia','Uzbekistan','Ukraine'],
 'rare':['China','Dem. Rep. Congo','Australia','Brazil','Russia','India','Vietnam','Myanmar'],
}
byname = {}
for ci, c in enumerate(countries): byname.setdefault(c['name'], ci)
tiles_by_country = {}
for k, ci in land.items(): tiles_by_country.setdefault(ci, []).append(k)
res = {}
for rk, names in BIAS.items():
    for nm in names:
        ci = byname.get(nm);
        if ci is None: continue
        ks = tiles_by_country[ci]
        r = rng(fnv(rk + nm))
        n_dep = max(1, int(len(ks) * 0.10))
        ks_sorted = sorted(ks, key=lambda k: r())  # deterministic shuffle
        for k in ks_sorted[:n_dep]:
            if k in res: continue
            res[k] = rk
            value[k] = value.get(k, 4) + 14
print('resource deposits:', len(res))

# ---- emit ----
tiles = []
for (col, row), ci in land.items():
    tiles.append([col, row, ci, round(value[(col, row)], 1)])
out = {
    'cell': D, 'cols': COLS, 'rows': ROWS, 'lon0': LON0, 'lat0': LAT0,
    'countries': [c['id'] for c in countries],
    'cnames': [c['name'] for c in countries],
    'tiles': tiles,
    'cities': {f'{k[0]},{k[1]}': v for k, v in cities.items()},
    'res': {f'{k[0]},{k[1]}': v for k, v in res.items()},
}
json.dump(out, open('game_grid.json', 'w'), separators=(',', ':'))
print('game_grid.json', round(os.path.getsize('game_grid.json')/1024, 1), 'KB')
# sanity: USA tile count + top-value US tiles (should be big cities)
usa = byname['United States of America']
ut = [(value[k], cities.get(k, ['',0])[0], k) for k, ci in land.items() if ci == usa]
ut.sort(reverse=True)
print('USA tiles:', len(tiles_by_country[usa]), 'top:', [(round(v), n) for v, n, k in ut[:6]])
