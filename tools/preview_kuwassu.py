"""Render the actual GLB triangles for offline shape/color review (Pillow needed)."""
import json, math, struct
from pathlib import Path
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
def triangles(name,height,crystal=False):
    data=(ROOT/name).read_bytes();size=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+size]);binary=data[28+size:]
    def array(index):
        acc=doc['accessors'][index];view=doc['bufferViews'][acc['bufferView']]
        return list(struct.iter_unpack('<fff',binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']]))
    parts=[];allp=[]
    for mesh in doc['meshes']:
        primitive=mesh['primitives'][0];attr=primitive['attributes'];p=array(attr['POSITION']);n=array(attr['NORMAL'])
        if crystal:p=[(x,z,-y) for x,y,z in p];n=[(x,z,-y) for x,y,z in n]
        color=doc['materials'][primitive['material']]['pbrMetallicRoughness']['baseColorFactor'][:3]
        colors=array(attr['COLOR_0']) if 'COLOR_0' in attr else [color]*len(p)
        parts.append((p,n,colors));allp.extend(p)
    low=[min(p[i] for p in allp) for i in range(3)];high=[max(p[i] for p in allp) for i in range(3)]
    center=[(a+b)/2 for a,b in zip(low,high)];scale=height/(high[1]-low[1])
    out=[]
    for positions,normals,colors in parts:
        for i in range(0,len(positions),3):
            p=[tuple((point[k]-center[k])*scale+(1.95 if crystal and k==1 else 0) for k in range(3)) for point in positions[i:i+3]]
            n=[sum(normal[k] for normal in normals[i:i+3])/3 for k in range(3)]
            out.append((p,n,colors[i]))
    return out

image=Image.new('RGB',(800,920),'#e9f1f7');draw=ImageDraw.Draw(image)
draw.ellipse((170,824,630,866),fill='#cad5e3')
faces=[];angle=.12
for p,n,color in triangles('kuwassu_unpo_character.glb',2.8)+triangles('crystal_unpo_projectile.glb',1.65,True):
    def rotate(v):return (v[0]*math.cos(angle)+v[2]*math.sin(angle),v[1],-v[0]*math.sin(angle)+v[2]*math.cos(angle))
    p=[rotate(point) for point in p];n=rotate(n)
    if n[2]<0:continue
    light=max(0,n[0]*-.3+n[1]*.55+n[2]*.7)
    brightness=.68+.32*light
    rgb=tuple(min(255,int(v*255*brightness)) for v in color)
    screen=[(400+x*175,620-y*175) for x,y,z in p]
    faces.append((sum(point[2] for point in p)/3,screen,rgb))
for depth,screen,color in sorted(faces,key=lambda item:item[0]):draw.polygon(screen,fill=color)
image.save(ROOT/'preview.png')
print(ROOT/'preview.png')
