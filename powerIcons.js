// Small procedural illustrations, generated once per item type and cached by PowerItem.
export function createPowerIcon(type, color) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const accent = '#' + color.toString(16).padStart(6, '0');
  const polygon = (points, fill, stroke = '#ecfaff', width = 2) => {
    ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  };
  const line = (points, stroke, width = 3) => {
    ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
  };
  const disk = (x,y,r,fill) => {
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle = fill; ctx.fill();
  };
  ctx.lineJoin = ctx.lineCap = 'round';
  const background = ctx.createLinearGradient(0,0,128,128);
  background.addColorStop(0, '#243e58'); background.addColorStop(1, '#070e21');
  ctx.shadowColor = accent; ctx.shadowBlur = 7;
  ctx.beginPath(); ctx.roundRect(7,7,114,114,24);
  ctx.fillStyle = background; ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.roundRect(13,13,102,102,19);
  ctx.strokeStyle = '#ffffff22'; ctx.lineWidth = 1; ctx.stroke();
  const halo = ctx.createRadialGradient(64,61,3,64,61,51);
  halo.addColorStop(0, accent + '55'); halo.addColorStop(1, accent + '00');
  ctx.fillStyle = halo; ctx.fillRect(14,14,100,100);

  switch (type) {
    case 'orb':
      ctx.beginPath();ctx.ellipse(64,64,44,20,-Math.PI/6,0,Math.PI*2);
      ctx.strokeStyle=accent;ctx.lineWidth=4;ctx.stroke();
      disk(64,64,24,accent);disk(59,57,16,'#fff1a5');disk(53,51,6,'#ffffff');
      disk(99,42,7,'#fff8cb');
      break;
    case 'energy': {
      // Glass capsule with a bright healing core and metal end caps.
      ctx.save(); ctx.translate(64,64); ctx.rotate(-Math.PI/5);
      ctx.beginPath(); ctx.roundRect(-21,-39,42,78,19);
      ctx.fillStyle = '#e8faff'; ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = accent; ctx.fillRect(-17,-15,34,38);
      ctx.fillStyle = '#627e96'; ctx.fillRect(-16,-27,32,8); ctx.fillRect(-16,27,32,5);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-4,-9,8,25); ctx.fillRect(-12,0,24,8);
      line([[-14,-10],[-14,20]], '#ffffff99', 3);
      ctx.restore();
      line([[92,28],[92,38]], '#fff3c1', 2); line([[87,33],[97,33]], '#fff3c1', 2);
      break;
    }
    case 'wide':
      // Three parallel shots, spreading from the muzzle.
      polygon([[23,52],[43,64],[23,76],[29,64]], '#dffaff');
      for (const y of [36,64,92]) {
        line([[43,64],[55,y],[75,y]], accent, 4);
        line([[68,y],[94,y]], '#e4ffff', 8);
        polygon([[101,y],[91,y-6],[91,y+6]], accent, null);
        line([[60,y-10],[80,y-10]], accent+'66', 2);
      }
      break;
    case 'missile':
      // Diagonal rocket, swept fins, hot exhaust and a curved guidance trail.
      ctx.save(); ctx.setLineDash([3,6]);
      ctx.beginPath(); ctx.moveTo(26,94); ctx.quadraticCurveTo(13,66,36,42);
      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      polygon([[41,79],[22,106],[51,89]], '#ff742e', null);
      polygon([[44,82],[33,96],[50,88]], '#fff2ac', null);
      polygon([[42,62],[32,75],[30,90],[53,77]], accent);
      polygon([[60,80],[76,82],[85,72],[62,66]], accent);
      polygon([[42,71],[56,86],[87,53],[72,38]], '#e4edf5');
      polygon([[72,38],[87,53],[99,24]], accent);
      line([[53,70],[76,47]], '#839cb4', 3);
      polygon([[44,73],[54,83],[59,78],[49,68]], '#40566f', null);
      break;
    case 'quick':
      // Charge ring with a bold lightning bolt.
      ctx.beginPath(); ctx.arc(64,64,36,-Math.PI*.8,Math.PI*.7);
      ctx.strokeStyle = accent; ctx.lineWidth = 5; ctx.stroke();
      polygon([[34,35],[27,50],[43,46]], accent, null);
      polygon([[70,24],[42,68],[62,68],[55,104],[91,54],[70,54],[80,24]], '#dcffe0', accent, 3);
      line([[93,33],[103,25]], accent, 3); line([[100,45],[109,43]], accent, 3);
      break;
    case 'pod':
      // Two companion pods trace the main ship's path.
      ctx.save(); ctx.setLineDash([2,6]);
      line([[30,42],[43,46],[50,57],[68,64]], accent, 2);
      line([[30,86],[43,82],[50,71],[68,64]], accent, 2); ctx.restore();
      for (const y of [37,91]) {
        polygon([[21,y],[30,y-12],[45,y],[30,y+12]], '#bfb0ed', accent);
        disk(32,y,5,'#edffff'); line([[15,y],[9,y]], accent, 3);
      }
      polygon([[105,64],[66,46],[71,59],[57,64],[71,69],[66,82]], '#e8eeff', accent);
      polygon([[93,64],[76,59],[76,69]], '#627daf', null);
      line([[57,64],[48,64]], '#f6ceff', 4);
      break;
  }
  // Small colored markers reinforce the five existing pickup colors.
  for (let i=0;i<3;i++) disk(56+i*8,112,1.5,accent);
  return canvas;
}
