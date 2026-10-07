"""Validate generated GLBs, without third-party dependencies."""
import json, math, struct
from pathlib import Path
root=Path(__file__).resolve().parents[1]
for name in ('kuwassu_unpo_character.glb','crystal_unpo_projectile.glb'):
    data=(root/name).read_bytes()
    magic,version,total=struct.unpack_from('<4sII',data)
    assert magic==b'glTF' and version==2 and total==len(data)
    length,kind=struct.unpack_from('<I4s',data,12)
    assert kind==b'JSON'
    doc=json.loads(data[20:20+length])
    binary_size,binary_kind=struct.unpack_from('<I4s',data,20+length)
    binary=data[28+length:]
    assert binary_kind==b'BIN\0' and len(binary)==binary_size
    assert not doc.get('images') and not doc.get('textures')
    assert all('uri' not in buf for buf in doc['buffers'])
    triangles=0
    for mesh in doc['meshes']:
        for primitive in mesh['primitives']:
            attrs=primitive['attributes'];pos=doc['accessors'][attrs['POSITION']];normal=doc['accessors'][attrs['NORMAL']]
            assert pos['count']==normal['count'] and pos['count']%3==0
            assert all(math.isfinite(v) for v in pos['min']+pos['max'])
            assert all(b>a for a,b in zip(pos['min'],pos['max']))
            triangles+=pos['count']//3
            for attribute in attrs.values():
                view=doc['bufferViews'][doc['accessors'][attribute]['bufferView']]
                assert view.get('byteOffset',0)+view['byteLength']<=len(binary)
    assert triangles<25000
    if name=='crystal_unpo_projectile.glb':
        assert triangles==588
        mat=doc['materials'][0]
        assert mat['alphaMode']=='BLEND' and mat['doubleSided']
        assert mat['pbrMetallicRoughness']['baseColorFactor'][3]==.78
        assert mat['pbrMetallicRoughness']['roughnessFactor']<=.12
    print(f'PASS: {name}: {triangles} triangles, embedded geometry/materials, valid GLB')
