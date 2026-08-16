import json, os

d = json.load(open('countries-110m.json'))
sx, sy = d['transform']['scale']
tx, ty = d['transform']['translate']
raw_arcs = d['arcs']

def decode(arc):
    x = y = 0; pts = []
    for dx, dy in arc:
        x += dx; y += dy
        pts.append((x * sx + tx, y * sy + ty))
    return pts

arcs = [decode(a) for a in raw_arcs]
def arc_points(i):
    return arcs[i] if i >= 0 else arcs[~i][::-1]

def ring_points(ring):
    pts = []
    for i in ring:
        seg = arc_points(i)
        if pts: seg = seg[1:]
        pts.extend(seg)
    return pts

def unwrap(pts):
    # remove >180 longitude jumps so ring is continuous; then recenter
    out = []; off = 0.0; prev = None
    for lon, lat in pts:
        if prev is not None:
            dl = (lon + off) - prev
            if dl > 180: off -= 360
            elif dl < -180: off += 360
        nl = lon + off
        out.append((nl, lat)); prev = nl
    mean = sum(p[0] for p in out) / len(out)
    shift = 0
    if mean > 180: shift = -360
    elif mean < -180: shift = 360
    if shift: out = [(l + shift, la) for l, la in out]
    return out

geoms = d['objects']['countries']['geometries']
arc_owners = {}
countries = []

for gi, g in enumerate(geoms):
    name = g['properties']['name']
    if name == 'Antarctica':
        continue
    cid = g.get('id', str(gi))
    polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
    path_parts = []; used_arcs = set()
    cx = cy = 0.0; area2 = 0.0
    for poly in polys:
        for ri, ring in enumerate(poly):
            for i in ring:
                used_arcs.add(i if i >= 0 else ~i)
            pts = unwrap(ring_points(ring))
            if len(pts) < 2: continue
            sp = []
            for j, (lon, lat) in enumerate(pts):
                sp.append(('M' if j == 0 else 'L') + f'{round(lon,2)} {round(-lat,2)}')
            path_parts.append(''.join(sp) + 'Z')
            if ri == 0:
                a = ccx = ccy = 0.0
                for k in range(len(pts)):
                    x1, y1 = pts[k][0], -pts[k][1]
                    x2, y2 = pts[(k+1) % len(pts)][0], -pts[(k+1) % len(pts)][1]
                    cr = x1*y2 - x2*y1
                    a += cr; ccx += (x1+x2)*cr; ccy += (y1+y2)*cr
                a *= 0.5
                if abs(a) > 1e-9:
                    ccx /= (6*a); ccy /= (6*a); w = abs(a)
                    cx += ccx*w; cy += ccy*w; area2 += w
    if area2 > 0:
        cx /= area2; cy /= area2
    for ai in used_arcs:
        arc_owners.setdefault(ai, set()).add(len(countries))
    countries.append({'id': cid, 'name': name, 'd': ''.join(path_parts),
                      'cx': round(cx,2), 'cy': round(cy,2), 'area': round(area2,2)})

neighbors = [set() for _ in countries]
for owners in arc_owners.values():
    owners = list(owners)
    for a in range(len(owners)):
        for b in range(a+1, len(owners)):
            neighbors[owners[a]].add(owners[b]); neighbors[owners[b]].add(owners[a])

id_by_index = [c['id'] for c in countries]
for gi, c in enumerate(countries):
    c['nb'] = sorted(id_by_index[j] for j in neighbors[gi])

json.dump({'countries': countries}, open('game_map.json','w'), separators=(',',':'))
print('countries:', len(countries), 'size KB:', round(os.path.getsize('game_map.json')/1024,1))
# verify crossers fixed
import re
for c in countries:
    if c['name'] in ('Russia','Fiji'):
        xs=[float(n) for i,n in enumerate(re.findall(r'[-\d.]+', c['d'])) if i%2==0]
        j=0; prev=None
        for x in xs:
            if prev is not None: j=max(j,abs(x-prev))
            prev=x
        print(c['name'],'maxjump',round(j),'xrange',round(min(xs)),round(max(xs)),'area',c['area'])
