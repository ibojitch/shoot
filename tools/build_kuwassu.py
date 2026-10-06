"""Rebuild the stylized duck and amber spiral as standalone, texture-free GLBs.
Python standard library only. +Y-up body; +Z-up crystal (existing loader convention).
"""
import json, math, random, struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class Model:
    def __init__(self):
        self.data = bytearray()
        self.doc = {'asset': {'version': '2.0', 'generator': 'shoot stylized model builder'},
                    'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [],
                    'materials': [], 'buffers': [], 'bufferViews': [], 'accessors': []}
    def material(self, name, color, roughness=.7, metallic=0, emissive=None):
        mat = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [*color, 1],
               'metallicFactor': metallic, 'roughnessFactor': roughness}}
        if emissive: mat['emissiveFactor'] = emissive
        self.doc['materials'].append(mat)
        return len(self.doc['materials']) - 1
    def accessor(self, values, kind, target):
        while len(self.data) % 4: self.data.append(0)
        start = len(self.data)
        flat = [v for row in values for v in row]
        self.data.extend(struct.pack('<'+'f'*len(flat), *flat))
        self.doc['bufferViews'].append({'buffer': 0, 'byteOffset': start, 'byteLength': len(flat)*4, 'target': target})
        item = {'bufferView': len(self.doc['bufferViews'])-1, 'componentType': 5126,
                'count': len(values), 'type': kind}
        if kind == 'VEC3':
            item['min'] = [min(row[i] for row in values) for i in range(3)]
            item['max'] = [max(row[i] for row in values) for i in range(3)]
        self.doc['accessors'].append(item)
        return len(self.doc['accessors'])-1
    def mesh(self, name, positions, normals, material, colors=None):
        attributes = {'POSITION': self.accessor(positions, 'VEC3', 34962),
                      'NORMAL': self.accessor(normals, 'VEC3', 34962)}
        if colors: attributes['COLOR_0'] = self.accessor(colors, 'VEC3', 34962)
        self.doc['meshes'].append({'name': name, 'primitives': [{'attributes': attributes, 'material': material, 'mode': 4}]})
        self.doc['nodes'].append({'name': name, 'mesh': len(self.doc['meshes'])-1})
        self.doc['scenes'][0]['nodes'].append(len(self.doc['nodes'])-1)
    def sphere(self, name, center, scale, material, segments=20, rings=12, tilt=0):
        points, normals = [], []
        def vertex(i, j):
            a, b = i*math.pi/rings, j*2*math.pi/segments
            unit = (math.sin(a)*math.cos(b), math.cos(a), math.sin(a)*math.sin(b))
            p = [unit[k]*scale[k] for k in range(3)]
            n = [unit[k]/scale[k] for k in range(3)]
            for value in (p, n):
                value[0], value[1] = value[0]*math.cos(tilt)-value[1]*math.sin(tilt), value[0]*math.sin(tilt)+value[1]*math.cos(tilt)
            length = math.sqrt(sum(v*v for v in n))
            return tuple(p[k]+center[k] for k in range(3)), tuple(v/length for v in n)
        for i in range(rings):
            for j in range(segments):
                for indices in [((i,j),(i,j+1),(i+1,j)), ((i,j+1),(i+1,j+1),(i+1,j))]:
                    for pair in indices:
                        p,n = vertex(*pair); points.append(p); normals.append(n)
        self.mesh(name, points, normals, material)
    def save(self, name):
        self.doc['buffers'] = [{'byteLength': len(self.data)}]
        js = json.dumps(self.doc, separators=(',', ':')).encode()
        js += b' ' * (-len(js)%4)
        self.data.extend(b'\0' * (-len(self.data)%4))
        total = 12+8+len(js)+8+len(self.data)
        (ROOT/name).write_bytes(struct.pack('<4sII', b'glTF',2,total)+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(self.data),b'BIN\0')+self.data)
        print(name, 'parts:', len(self.doc['meshes']), 'triangles:', sum(self.doc['accessors'][m['primitives'][0]['attributes']['POSITION']]['count']//3 for m in self.doc['meshes']), 'bytes:', total)

def duck():
    m=Model()
    white=m.material('Feather ivory', (.97,.97,1),.82)
    shade=m.material('Feather soft blue shadow', (.77,.84,.94),.85)
    yellow=m.material('Golden bill and feet', (1,.62,.06),.4)
    lip=m.material('Bill outline', (.45,.19,.035),.6)
    mouth=m.material('Open mouth', (.25,.055,.045),.8)
    tongue=m.material('Pink tongue', (1,.25,.35),.55)
    eye=m.material('Eye dark outline', (.10,.035,.018),.3)
    brown=m.material('Glossy chestnut iris', (.36,.10,.025),.12)
    pupil=m.material('Pupil', (.025,.012,.012),.2)
    highlight=m.material('Eye catchlight', (1,1,1),.3,emissive=(.25,.25,.25))
    blush=m.material('Peach cheeks', (1,.57,.45),.8)
    blue=m.material('Fluffy sky blue', (.40,.79,.90),.9)
    blueLight=m.material('Fluffy blue highlights', (.65,.91,.97),.9)
    m.sphere('body',(.15,-.35,0),(.72,.83,.57),white)
    m.sphere('large round head',(-.20,.66,0),(.79,.83,.64),white)
    m.sphere('fluffy chest',(-.25,-.12,.34),(.52,.62,.30),white)
    # Tail and layered wing feathers give a readable silhouette at game scale.
    for i in range(3):
        m.sphere('tail feather '+str(i),(.84+i*.10,-.48+i*.19,-.12),(.52,.20,.24),white,tilt=.55)
    m.sphere('wing soft outline',(.53,-.17,.46),(.56,.46,.12),shade,tilt=.5)
    for i in range(4):
        m.sphere('wing feather '+str(i),(.47+i*.11,-.36+i*.17,.53),(.44,.16,.14),white,tilt=.55)
    # Big 3/4-view eye, with a second eye peeking around the bill.
    for name,x,y,z,s in [('near',-.48,.83,.54,1),('far',-.87,.86,.22,.6)]:
        m.sphere(name+' eye border',(x,y,z),(.24*s,.36*s,.08),eye)
        m.sphere(name+' white eye',(x+.025,y+.015,z+.04),(.205*s,.325*s,.055),highlight)
        m.sphere(name+' iris',(x-.045*s,y-.025,z+.095),(.145*s,.27*s,.045),brown)
        m.sphere(name+' pupil',(x-.070*s,y+.015,z+.125),(.088*s,.20*s,.023),pupil)
        m.sphere(name+' catchlight',(x-.07*s,y+.13*s,z+.152),(.049*s,.080*s,.012),highlight,segments=12,rings=8)
        m.sphere(name+' lower glint',(x+.005*s,y-.17*s,z+.15),(.028*s,.035*s,.012),yellow,segments=12,rings=8)
    m.sphere('cheek',(-.37,.34,.59),(.13,.075,.024),blush)
    # Open yellow beak with dark interior and tongue, all visible geometry.
    m.sphere('bill silhouette',(-.96,.38,.36),(.46,.30,.29),lip,tilt=-.15)
    m.sphere('open beak interior',(-1.05,.28,.52),(.25,.29,.10),mouth,tilt=-.2)
    m.sphere('lower yellow beak',(-1.05,.08,.44),(.25,.09,.16),yellow,tilt=-.22)
    m.sphere('tongue',(-1.07,.20,.61),(.16,.10,.024),tongue,tilt=.25)
    m.sphere('upper yellow bill',(-1.02,.49,.42),(.46,.13,.28),yellow,tilt=-.12)
    m.sphere('nostril',(-1.07,.56,.65),(.035,.023,.012),lip,segments=10,rings=6)
    for i,x in enumerate([-.40,.48]):
        m.sphere('leg '+str(i),(x,-1.09,.02),(.11,.24,.12),yellow,tilt=-.3 if i==0 else .2)
        m.sphere('webbed foot '+str(i),(x-.14,-1.29,.20),(.35,.12,.31),yellow,tilt=.25 if i==0 else -.15)
    # Rounded earmuffs, built from a core and restrained small fluffy lobes.
    for name,x,z in [('near',.38,.60),('far',.44,-.55)]:
        m.sphere(name+' earmuff',(x,.53,z),(.34,.38,.17),blue)
        for i in range(12):
            a=i*math.tau/12
            m.sphere(name+' fluff '+str(i),(x+math.cos(a)*.26,.53+math.sin(a)*.29,z+.04),(.115,.13,.10),blueLight if i%3==0 else blue,segments=10,rings=6)
        for i in range(5):
            m.sphere(name+' soft tuft '+str(i),(x+(i%3-1)*.13,.48+(i//3)*.14,z+.14),(.13,.14,.07),blueLight,segments=10,rings=6)
    m.save('kuwassu_unpo_character.glb')

def crystal():
    m=Model(); amber=m.material('Faceted golden amber', (1,1,1),.18,.35,emissive=(.10,.035,.003))
    points=[];normals=[];colors=[];random.seed(42)
    path=[];steps=64;sides=9
    # Broad coiled base tapering into a curled tip, rather than a cone.
    for i in range(steps+1):
        t=i/steps;a=t*math.tau*2.65
        r=.65*(1-t)**.8
        path.append((r*math.cos(a),.23+1.55*t,r*.72*math.sin(a)))
    rings=[]
    for i,(x,y,z) in enumerate(path):
        t=i/steps;a=t*math.tau*2.65;tube=.29*(1-t)**.65+.012
        rings.append([(x+math.cos(a)*math.cos(j*math.tau/sides)*tube,y+math.sin(j*math.tau/sides)*tube,z+math.sin(a)*math.cos(j*math.tau/sides)*tube) for j in range(sides)])
    def triangle(vertices):
        a,b,c=vertices;u=[b[k]-a[k] for k in range(3)];v=[c[k]-a[k] for k in range(3)]
        n=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);length=math.sqrt(sum(q*q for q in n)) or 1
        shade=random.choice([(1,.53,.13),(.65,.23,.035),(1,.75,.36),(.86,.36,.08),(1,.9,.62),(.95,.64,.39)])
        for p in vertices:
            points.append((p[0],-p[2],p[1]));normals.append((n[0]/length,-n[2]/length,n[1]/length));colors.append(shade)
    for i in range(steps):
        for j in range(sides):
            k=(j+1)%sides
            triangle((rings[i][j],rings[i][k],rings[i+1][j]))
            triangle((rings[i][k],rings[i+1][k],rings[i+1][j]))
    for j in range(sides):
        k=(j+1)%sides
        triangle((path[0],rings[0][k],rings[0][j]));triangle((path[-1],rings[-1][j],rings[-1][k]))
    m.mesh('Amber spiral crystal',points,normals,amber,colors)
    m.save('crystal_unpo_projectile.glb')

if __name__=='__main__': duck();crystal()
