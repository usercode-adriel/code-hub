# Texturas de rua e calçada a partir da folha "Asphalt Road Tiles / Sidewalk Tiles" (sem marca d'água).
from PIL import Image
import numpy as np
U='/root/.claude/uploads/ecd13ed2-02c5-5b53-9ec4-04b4e1b3ffd5/11ee5b9a-image.png'
OUT='/home/user/code-hub/public/assets/rpg/tiles/'
im=Image.open(U).convert('RGB')
# uma placa de calçada (miolo, sem rejunte) -> 7x7, com rejunte escuro e brilho de borda, 2x2 placas por textura
pav=im.crop((36,606,85,650)).resize((7,7),Image.BOX)
grout=(92,90,88)
t=Image.new('RGB',(16,16),grout)
for oy in (0,8):
    for ox in (0,8): t.paste(pav,(ox+1,oy+1))
a=np.asarray(t).copy()
for oy in (0,8):
    for ox in (0,8):
        a[oy+1,ox+1:ox+8]=np.minimum(255,a[oy+1,ox+1:ox+8].astype(int)+28)  # brilho superior
Image.fromarray(a.astype(np.uint8)).save(OUT+'sidewalk.png')
# asfalto: trecho liso da folha (sem faixas), ladrilhado em espelho para não ter emenda
asp=im.crop((850,118,958,150)).resize((32,32),Image.BOX)
q=Image.new('RGB',(64,64))
q.paste(asp,(0,0)); q.paste(asp.transpose(Image.FLIP_LEFT_RIGHT),(32,0))
q.paste(asp.transpose(Image.FLIP_TOP_BOTTOM),(0,32)); q.paste(asp.transpose(Image.ROTATE_180),(32,32))
q=Image.fromarray(np.clip(np.asarray(q).astype(int)*1.35+8,0,255).astype(np.uint8))  # tom de asfalto da cidade
q.save(OUT+'asphalt.png')
# calçada com meio-fio (frente dos prédios): faixa de placas + pedras do meio-fio da folha
curb=im.crop((27,712,151,726)).resize((16,3),Image.BOX)
f=Image.new('RGB',(16,11)); f.paste(Image.open(OUT+'sidewalk.png').crop((0,0,16,8)),(0,0)); f.paste(curb,(0,8))
f.save(OUT+'front.png')
print('ok')
