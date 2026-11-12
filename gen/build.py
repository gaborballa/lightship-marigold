# Builds the static table "Lightship Marigold" from game/layout.json, bakes Cycles light for two
# lamp states (dim attract, fully lit) and exports the meshes.
#   Blender -b --python gen/build.py -- preview            -> shots/_cy_dim.png, _cy_lit.png
#   Blender -b --python gen/build.py -- bake <scale> <spp> -> game/bake/*.png, game/table.glb
import bpy, bmesh, json, math, os, sys
import numpy as np
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['preview']
MODE = argv[0]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAY = json.load(open(ROOT + '/game/layout.json'))
TEX = ROOT + '/game/tex/'
W, WALL_H = LAY['W'], LAY['WALL_H']

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
GROUPS = {}

# ---------------------------------------------------------------- materials
def img(name, cs='sRGB'):
    i = bpy.data.images.load(TEX + name); i.colorspace_settings.name = cs; return i

def mat(name, color=(0.8, 0.8, 0.8), rough=0.5, metal=0.0, image=None, emis=None, coat=0.0, sss=0.0, trans=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if coat: b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = 0.08
    if sss: b.inputs['Subsurface Weight'].default_value = sss; b.inputs['Subsurface Radius'].default_value = (0.4, 0.3, 0.2)
    if trans: b.inputs['Transmission Weight'].default_value = trans
    if image:
        uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'art'
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = image; t.name = 'ART'
        nt.links.new(uv.outputs['UV'], t.inputs['Vector']); nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if emis is not None:
        b.inputs['Emission Color'].default_value = (*emis, 1); b.inputs['Emission Strength'].default_value = 0
    return m

def wood(name, c1, c2, coat=0.6):
    m = mat(name, c1, 0.35, coat=coat); nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.9, 0.06, 0.9)
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 3.0; n.inputs['Detail'].default_value = 8; n.inputs['Roughness'].default_value = 0.65
    r = nt.nodes.new('ShaderNodeValToRGB'); r.color_ramp.elements[0].position = 0.35; r.color_ramp.elements[0].color = (*c1, 1); r.color_ramp.elements[1].position = 0.7; r.color_ramp.elements[1].color = (*c2, 1)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], n.inputs['Vector']); nt.links.new(n.outputs['Fac'], r.inputs['Fac']); nt.links.new(r.outputs['Color'], b.inputs['Base Color'])
    return m

I_art, I_pl, I_lamps, I_bg = img('pf_art.jpg'), img('plastics.jpg'), img('pf_lamps.png'), img('backglass.jpg')
M = {
    'pf': mat('pf', image=I_art, rough=0.22, coat=1.0),
    'wood': wood('wood', (0.07, 0.03, 0.014), (0.19, 0.09, 0.035)),
    'apron': mat('apron', image=I_pl, rough=0.3, coat=0.5),
    'plastic': mat('plastic', image=I_pl, rough=0.18, sss=0.25, emis=(1, 1, 1)),
    'cap': mat('cap', image=I_pl, rough=0.15, emis=(1, 1, 1)),
    'bumper': mat('bumper', (0.86, 0.80, 0.62), 0.3, emis=(1.0, 0.62, 0.28), sss=0.3),
    'rubber': mat('rubber', (0.80, 0.78, 0.70), 0.62, sss=0.15),
    'bulb': mat('bulb', (0.9, 0.85, 0.7), 0.1, emis=(1.0, 0.56, 0.22)),
    'cab': mat('cab', (0.035, 0.07, 0.13), 0.45),
    'backglass': mat('backglass', (0, 0, 0), 0.1, emis=(1, 1, 1)),
    'steel': mat('steel', (0.62, 0.62, 0.60), 0.28, metal=1.0),
    'chrome': mat('chrome', (0.9, 0.9, 0.9), 0.07, metal=1.0),
    'brass': mat('brass', (0.78, 0.57, 0.25), 0.3, metal=1.0),
    'room': mat('room', (0.16, 0.12, 0.10), 0.9),
    'roomfloor': mat('roomfloor', (0.07, 0.035, 0.03), 0.6),
    'warm': mat('warm', (0, 0, 0), 0.5, emis=(1.0, 0.55, 0.25)),
    'doorl': mat('doorl', (0, 0, 0), 0.5, emis=(1.0, 0.6, 0.3)),
    'cool': mat('cool', (0, 0, 0), 0.5, emis=(0.35, 0.55, 1.0)),
}
# playfield: lamp inserts emit through the lacquer
nt = M['pf'].node_tree; b = nt.nodes['Principled BSDF']
uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'art'; t = nt.nodes.new('ShaderNodeTexImage'); t.image = I_lamps
nt.links.new(uv.outputs['UV'], t.inputs['Vector']); nt.links.new(t.outputs['Color'], b.inputs['Emission Color'])
for k in ('cap', 'plastic'):
    nt = M[k].node_tree; nt.links.new(nt.nodes['ART'].outputs['Color'], nt.nodes['Principled BSDF'].inputs['Emission Color'])
nt = M['backglass'].node_tree; b = nt.nodes['Principled BSDF']
t = nt.nodes.new('ShaderNodeTexImage'); t.image = I_bg; nt.links.new(t.outputs['Color'], b.inputs['Emission Color'])  # default UV
M['warm'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 9.0
M['cool'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 2.2
M['doorl'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 1.0

def set_state(lit):
    e = lambda k, v: M[k].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].__setattr__('default_value', v)
    e('pf', 5.0 if lit else 0.35); e('cap', 1.7 if lit else 0.05); e('bumper', 0.3 if lit else 0.01)
    e('plastic', 0.32 if lit else 0.006); e('bulb', 28.0 if lit else 0.1); e('backglass', 1.5 if lit else 0.3)

# ---------------------------------------------------------------- mesh helpers
def add(name, verts, faces, m, group, smooth=False):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], faces); me.update()
    ob = bpy.data.objects.new(name, me); scene.collection.objects.link(ob)
    me.materials.append(M[m])
    if smooth:
        for p in me.polygons: p.use_smooth = True
    uvl = me.uv_layers.new(name='art')
    for l in me.loops:
        v = me.vertices[l.vertex_index].co; uvl.data[l.index].uv = ((v.x + 24) / 48, (v.y + 4) / 96)
    if group == 'M': group = 'M_' + m
    GROUPS.setdefault(group, []).append(ob); return ob

def lathe(name, prof, x, y, m, group, segs=24, z0=0.0):
    V, F = [], []
    for j in range(len(prof) - 1):
        base = len(V)
        for (r, z) in (prof[j], prof[j + 1]):
            for i in range(segs):
                a = 2 * math.pi * i / segs; V.append((x + r * math.cos(a), y + r * math.sin(a), z0 + z))
        for i in range(segs):
            k = (i + 1) % segs; F.append((base + i, base + k, base + segs + k, base + segs + i))
    return add(name, V, F, m, group, True)

def prism(name, poly, z0, z1, m, group):
    n = len(poly); ar = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    if ar < 0: poly = poly[::-1]
    V = [(p[0], p[1], z0) for p in poly] + [(p[0], p[1], z1) for p in poly]
    F = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return add(name, V, F, m, group)

def box(name, a, b, m, group):
    return prism(name, [(a[0], a[1]), (b[0], a[1]), (b[0], b[1]), (a[0], b[1])], a[2], b[2], m, group)

def tube(name, path, r, m, group, closed=False, segs=14):
    P = [Vector(p) for p in path]; n = len(P); V, F = [], []
    up = Vector((0, 0, 1))
    for i in range(n):
        a = P[(i - 1) % n] if (closed or i > 0) else P[0]; c = P[(i + 1) % n] if (closed or i < n - 1) else P[-1]
        t = (c - a).normalized(); s = t.cross(up)
        if s.length < 1e-4: s = Vector((1, 0, 0))
        s.normalize(); u = s.cross(t)
        for k in range(segs):
            an = 2 * math.pi * k / segs; V.append(P[i] + (s * math.cos(an) + u * math.sin(an)) * r)
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        for k in range(segs):
            k2 = (k + 1) % segs; F.append((i * segs + k, j * segs + k, j * segs + k2, i * segs + k2))
    return add(name, V, F, m, group, True)

def strip(name, pts, h, th, m, group, z0=0.0):   # thin standing strip along a polyline
    for i in range(len(pts) - 1):
        a, c = Vector(pts[i]), Vector(pts[i + 1]); d = (c - a).normalized(); nrm = Vector((-d.y, d.x)) * th / 2
        prism(name, [a - nrm, c - nrm, c + nrm, a + nrm], z0, z0 + h, m, group)

def band_path(pts, off, z):
    n = len(pts); ar = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n)); sg = 1 if ar > 0 else -1
    out = []
    for i in range(n):
        p0, p, p1 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        d0, d1 = (p - p0).normalized(), (p1 - p).normalized()
        a0 = math.atan2(-sg * d0.x, sg * d0.y); a1 = math.atan2(-sg * d1.x, sg * d1.y)
        da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        for k in range(25): a = a0 + da * k / 24; out.append((p.x + off * math.cos(a), p.y + off * math.sin(a), z))
    return out

def post(x, y, top, rubber):
    lathe('post', [(0.0, 0), (0.42, 0), (0.42, 0.22), (0.3, 0.3), (0.3, 1.02), (0.36, 1.08), (0.36, 1.62), (0.3, 1.68), (0.3, top)], x, y, 'brass', 'M', 48)
    lathe('nut', [(0.34, 0), (0.34, 0.1)], x, y, 'chrome', 'M', 6, top + (0.15 if top > 2.8 else 0))
    lathe('nutcap', [(0.3 * math.cos(math.pi * i / 16), 0.1 + 0.3 * math.sin(math.pi * i / 16)) for i in range(9)], x, y, 'chrome', 'M', 32, top + (0.15 if top > 2.8 else 0))
    if rubber:
        ring = [(x + 0.55 * math.cos(a), y + 0.55 * math.sin(a), 1.35) for a in [2 * math.pi * i / 64 for i in range(64)]]
        tube('ring', ring, 0.22, 'rubber', 'A', True)

# ---------------------------------------------------------------- the table
pf = add('playfield', [(-21.5, 2, 0), (21.5, 2, 0), (21.5, 88.5, 0), (-21.5, 88.5, 0)], [(0, 1, 2, 3)], 'pf', 'F')
def quad(name, a, b, c, d, m, group): return add(name, [a, b, c, d], [(0, 1, 2, 3)], m, group)
H = WALL_H
for s in (-1, 1):
    x = s * 21; o = s * 23.6
    if s > 0: quad('rail', (x, 2, 0), (x, 2, H), (x, 72, H), (x, 72, 0), 'wood', 'A')
    else: quad('rail', (x, 2, 0), (x, 72, 0), (x, 72, H), (x, 2, H), 'wood', 'A')
    quad('railtop', (min(x, o), -5, H), (max(x, o), -5, H), (max(x, o), 91.5, H), (min(x, o), 91.5, H), 'wood', 'A')
arch = LAY['arch']
for i in range(len(arch) - 1):
    a, c = arch[i], arch[i + 1]
    quad('arch', (a[0], a[1], 0), (a[0], a[1], H), (c[0], c[1], H), (c[0], c[1], 0), 'wood', 'A')
    quad('archtop', (a[0], a[1], H), (a[0], 91.5, H), (c[0], 91.5, H), (c[0], c[1], H), 'wood', 'A')
strip('archliner', [(p[0] * 0.997, 72 + (p[1] - 72) * 0.997) for p in arch], 2.2, 0.12, 'steel', 'M')
quad('apron', (-21, -5, 2.4), (21, -5, 2.4), (21, 2.5, 2.4), (-21, 2.5, 2.4), 'apron', 'A'); quad('apronf', (-21, 2.5, 0), (-21, 2.5, 2.4), (21, 2.5, 2.4), (21, 2.5, 0), 'apron', 'A')
box('lockbar', (-24, -7.2, 5.6), (24, -4.6, 7.4), 'chrome', 'M')
for r in LAY['rails']:
    if not r.get('wire'):
        strip('lane', r['pts'], r['h'], 0.16, 'steel', 'M'); continue
    a, c = Vector(r['pts'][0]), Vector(r['pts'][1]); n = max(2, int((c - a).length / 2.9) + 1)
    for i in range(n):
        q = a + (c - a) * i / (n - 1); end = i in (0, n - 1)
        if end: lathe('lanepost', [(0.0, 0), (0.3, 0), (0.3, 0.12), (0.17, 0.2), (0.17, 2.02), (0.12, 2.12), (0.0, 2.16)], q.x, q.y, 'chrome', 'M', 28)
        else: lathe('lanepin', [(0.07, 0), (0.07, 1.78)], q.x, q.y, 'chrome', 'M', 12)
    for z in (0.78, 1.78): tube('lanewire', [(a.x, a.y, z), (c.x, c.y, z)], 0.07, 'chrome', 'M', False, 12)
plastic_posts = set()
for b in LAY['bands']:
    tube('band', band_path(b['pts'], 0.40, 1.35), 0.17, 'rubber', 'A', True)
    for p in b['pts']: plastic_posts.add((p[0], p[1]))
for p in LAY['posts']:
    tall = p.get('hid') or (p['x'], p['y']) in plastic_posts
    post(p['x'], p['y'], 3.0 if tall else 2.5, p['rubber'])
for p in LAY['plastics']:
    prism('plastic', [tuple(q) for q in p['poly']], p['z'], p['z'] + 0.15, 'plastic', 'A')
    cx = sum(q[0] for q in p['poly']) / len(p['poly']); cy = sum(q[1] for q in p['poly']) / len(p['poly'])
    for i in range(len(p['poly'])):
        a, c = p['poly'][i], p['poly'][(i + 1) % len(p['poly'])]; sx = (a[0] + c[0]) / 2; sy = (a[1] + c[1]) / 2
        lathe('screw', [(0.0, 0.08), (0.17, 0.08), (0.24, 0.0)], sx + (cx - sx) * 0.3, sy + (cy - sy) * 0.3, 'steel', 'M', 16, p['z'] + 0.15)
for s in (-1, 1):
    strip('kick', [(s * 20.95, 2.5), (s * 20.95, 72)], 1.1, 0.06, 'steel', 'M')
    tube('fwire', [(s * 21, 15.5, 2.12), (s * 9, 7.2, 2.12)], 0.07, 'chrome', 'M', False, 10)
tube('awire', [(q[0] * 0.992, 72 + (q[1] - 72) * 0.992, 2.34) for q in arch], 0.07, 'chrome', 'M', False, 10)
for bl in LAY['bulbs']:
    x, y, z = bl['x'], bl['y'], bl['z']
    lathe('bulb', [(0.42 * math.sin(math.pi * i / 12), -0.42 * math.cos(math.pi * i / 12)) for i in range(13)], x, y, 'bulb', 'A', 28, z)
    lathe('socket', [(0.0, 0), (0.3, 0), (0.3, z - 0.85), (0.24, z - 0.8), (0.24, z - 0.4), (0.0, z - 0.4)], x, y, 'brass', 'M', 12)
    box('lug', (x + 0.22, y - 0.1, 0.3), (x + 0.5, y + 0.1, 0.42), 'steel', 'M')
for bm in LAY['bumpers']:
    x, y = bm['x'], bm['y']
    lathe('bskirt', [(2.95, 0), (2.95, 0.18), (2.6, 0.42), (2.25, 0.5)], x, y, 'bumper', 'A', 192)
    prof = [(2.25, 0.5), (2.25, 1.0)] + [(2.25 - 0.12 * (i % 2), 1.0 + i * 0.3) for i in range(1, 9)] + [(2.25, 3.7), (2.6, 3.9), (2.6, 4.1)]
    lathe('bbody', prof, x, y, 'bumper', 'A', 192)
    lathe('bcap', [(2.6, 4.1), (3.4, 4.1), (3.45, 4.3), (3.3, 4.62), (2.6, 4.85), (1.4, 4.97), (0.0, 5.0)], x, y, 'cap', 'A', 192)
for r in LAY['rollovers']:
    tube('rollwire', [(r['x'], r['y'] - 1.0, 0.0), (r['x'], r['y'] - 0.6, 0.28), (r['x'], r['y'] + 0.6, 0.28), (r['x'], r['y'] + 1.0, 0.0)], 0.07, 'chrome', 'M', False, 6)
for h in LAY['holes']:
    lathe('holerim', [(h['r'] + 0.22, 0.0), (h['r'] + 0.2, 0.06), (h['r'], 0.06), (h['r'] - 0.05, 0.0)], h['x'], h['y'], 'chrome', 'M', 40)
# backbox and backglass
box('backbox', (-27, 90.2, 4), (27, 104, 56), 'cab', 'B')
bg = add('backglass', [(-25, 90.0, 8), (25, 90.0, 8), (25, 90.0, 52), (-25, 90.0, 52)], [(0, 1, 2, 3)], 'backglass', 'G')
uvl = bg.data.uv_layers.new(name='uv0')
for l, uvc in zip(bg.data.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]): uvl.data[l.index].uv = uvc
bg.data.uv_layers.active = uvl; uvl.active_render = True
box('bgtrim', (-25.8, 89.6, 7.2), (25.8, 90.1, 8), 'steel', 'M'); box('bgtrim', (-25.8, 89.6, 52), (25.8, 90.1, 52.8), 'steel', 'M')
box('cabinet', (-23.6, -8, -40), (23.6, 91.5, -0.5), 'cab', 'X')
# the room: bake-only light and bounce
rv = [(-260, -330, -110), (260, -330, -110), (260, 280, -110), (-260, 280, -110), (-260, -330, 190), (260, -330, 190), (260, 280, 190), (-260, 280, 190)]
add('room', rv, [(0, 1, 2, 3)], 'roomfloor', 'X'); add('roomw', rv, [(7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], 'room', 'X')
lathe('pendant', [(0.0, 0), (30, 0)], -60, -70, 'warm', 'X', 24, 128)
lathe('pendant', [(0.0, 0), (22, 0)], 150, 130, 'warm', 'X', 24, 135)
add('window', [(-259, -160, 30), (-259, 20, 30), (-259, 20, 150), (-259, -160, 150)], [(0, 1, 2, 3)], 'cool', 'X')
add('door', [(120, 279, -110), (200, 279, -110), (200, 279, 90), (120, 279, 90)], [(3, 2, 1, 0)], 'doorl', 'X')
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.02, 0.022, 0.03, 1)

# ---------------------------------------------------------------- cycles
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'METAL'; prefs.get_devices()
for d in prefs.devices: d.use = True
scene.cycles.device = 'GPU'; scene.cycles.use_denoising = True
scene.cycles.sample_clamp_indirect = 6.0; scene.cycles.max_bounces = 6; scene.cycles.caustics_reflective = False; scene.cycles.caustics_refractive = False
scene.view_settings.view_transform = 'Standard'

def join(group):
    obs = GROUPS[group]
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs: o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    if len(obs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = group; GROUPS[group] = [o]; return o

if MODE == 'preview':
    cam = bpy.data.cameras.new('c'); cam.lens = 23.46; cam.sensor_width = 36; cam.clip_start = 0.05; cam.clip_end = 2000
    co = bpy.data.objects.new('c', cam); scene.collection.objects.link(co); scene.camera = co
    scene.render.resolution_x, scene.render.resolution_y = 960, 540; scene.cycles.samples = 64
    views = {'a1': ((0, 14.2, 2.2), (0, 40, 2.6)), 'a2': ((-10, 37.5, 2.2), (2, 50, 2.4))}
    only = argv[1:] or list(views)
    for vn in only:
        pos, tgt = views[vn]; co.location = pos
        co.rotation_euler = (Vector(tgt) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        for lit in (0, 1):
            set_state(lit); scene.view_settings.exposure = 0.0
            scene.render.filepath = ROOT + '/shots/_cy_%s_%s.png' % (vn, 'lit' if lit else 'dim'); bpy.ops.render.render(write_still=True)
    sys.exit(0)

# ---------------------------------------------------------------- bake
SCALE = float(argv[1]) if len(argv) > 1 else 1; SPP = int(argv[2]) if len(argv) > 2 else 16
A, F, B = join('A'), join('F'), join('B')
for o, margin in ((A, 0.0025), (B, 0.01)):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    uvb = o.data.uv_layers.new(name='bake'); o.data.uv_layers.active = uvb
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
F.data.uv_layers.active = F.data.uv_layers['art']

import time
def blur_masked(rgb, mask, h, w, rad=3, sigma=1.4):
    k = np.exp(-0.5 * (np.arange(-rad, rad + 1) / sigma) ** 2); k /= k.sum()
    a = (rgb * mask[:, None]).reshape(h, w, 3); m = mask.reshape(h, w)
    def conv(x, axis):
        out = np.zeros_like(x)
        for i, kv in enumerate(k): out += kv * np.roll(x, i - rad, axis=axis)
        return out
    for _ in range(2):
        a = conv(conv(a, 0), 1); m = conv(conv(m, 0), 1)
    return (a / np.maximum(m, 1e-4)[:, :, None]).reshape(h * w, 3)

def bake(o, name, w, h, kind, spp):
    t0 = time.time()
    im = bpy.data.images.new('bk', max(64, int(w * SCALE)), max(64, int(h * SCALE)), float_buffer=True, alpha=True)
    for ms in o.material_slots:
        nt = ms.material.node_tree; n = nt.nodes.get('BAKE') or nt.nodes.new('ShaderNodeTexImage'); n.name = 'BAKE'; n.image = im; nt.nodes.active = n
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    scene.cycles.samples = spp
    if kind == 'light': bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=0, use_clear=True)
    elif kind == 'alb': bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=8, use_clear=True)
    else: bpy.ops.object.bake(type='EMIT', margin=8, use_clear=True)
    W_, H_ = im.size[0], im.size[1]; n = W_ * H_; px = np.empty(n * 4, dtype=np.float32); im.pixels.foreach_get(px)
    px = px.reshape(n, 4); rgb = np.clip(np.nan_to_num(px[:, :3]), 0, 1e4)
    if kind == 'light':
        rgb = np.minimum(rgb, 40.0); rgb = blur_masked(rgb, (px[:, 3] > 0.5).astype(np.float32), H_, W_, 4, 1.4 if name[0] == 'F' else 2.0)
    enc = np.power(rgb, 1 / 2.2) if kind == 'alb' else np.power(rgb / (1.0 + rgb), 1 / 2.2)
    o8 = bpy.data.images.new('o8', W_, H_, alpha=False); o8.colorspace_settings.name = 'Non-Color'
    px[:, :3] = np.clip(enc, 0, 1); px[:, 3] = 1; o8.pixels.foreach_set(px.ravel())
    o8.filepath_raw = ROOT + '/game/bake/%s.png' % name; o8.file_format = 'PNG'; o8.save()
    print('BAKED %s %dx%d spp %d mean %.4f in %.1fs' % (name, W_, H_, spp, float(rgb.mean()), time.time() - t0)); sys.stdout.flush()
    bpy.data.images.remove(im); bpy.data.images.remove(o8)

if MODE == 'bake': set_state(1)
if MODE == 'bake': bake(A, 'A_alb', 4096, 4096, 'alb', 1); bake(B, 'B_alb', 1024, 1024, 'alb', 1); bake(A, 'A_emit', 2048, 2048, 'emit', 1)
for lit in ((0, 1) if MODE == 'bake' else ()):
    set_state(lit); tag = 'lit' if lit else 'dim'
    bake(F, 'F_' + tag, 2048, 4096, 'light', SPP)
    bake(A, 'A_' + tag, 2048, 2048, 'light', SPP)
    bake(B, 'B_' + tag, 512, 512, 'light', max(16, SPP // 4))

# room panorama (seen through the glass)
if 'pano' in argv:
    for g in ('A', 'F', 'B', 'M_steel', 'M_chrome', 'M_brass', 'G'):
        for o in GROUPS[g]: o.hide_render = True
    for o in GROUPS['X']:
        if o.name.startswith('cabinet'): o.hide_render = True
    cam = bpy.data.cameras.new('p'); cam.type = 'PANO'; cam.panorama_type = 'EQUIRECTANGULAR'
    co = bpy.data.objects.new('p', cam); scene.collection.objects.link(co); scene.camera = co; co.location = (0, 44, 8); co.rotation_euler = (math.pi / 2, 0, 0)
    scene.render.resolution_x, scene.render.resolution_y = 2048, 1024; scene.cycles.samples = 400
    scene.render.image_settings.file_format = 'JPEG'; scene.render.image_settings.quality = 90
    scene.render.filepath = ROOT + '/game/tex/room.jpg'; bpy.ops.render.render(write_still=True)

# ---------------------------------------------------------------- export
for o in (A, B):
    o.data.uv_layers.remove(o.data.uv_layers['art'])
Ms = [join(g) for g in ('M_steel', 'M_chrome', 'M_brass')]
GROUPS['G'][0].data.uv_layers.remove(GROUPS['G'][0].data.uv_layers['art'])
bpy.ops.object.select_all(action='DESELECT')
for o in [A, F, B, GROUPS['G'][0]] + Ms: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=ROOT + '/game/table.glb', export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_materials='PLACEHOLDER', export_texcoords=True, export_normals=True)
print('EXPORTED', os.path.getsize(ROOT + '/game/table.glb'))
