const { createCanvas, loadImage } = require('canvas');

// Función auxiliar para dibujar rectángulos con bordes redondeados
function drawRoundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

async function generarCollagePokemon(listaPokemonData) {
  const colCount = 2;
  const rowCount = 4;
  const cardWidth = 460; 
  const cardHeight = 260; 
  const margin = 25;

  const canvasWidth = (colCount * cardWidth) + ((colCount + 1) * margin);
  const canvasHeight = (rowCount * cardHeight) + ((rowCount + 1) * margin);

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Fondo principal
  ctx.fillStyle = '#0f172a'; 
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const statColors = {
    hp: '#22c55e',    
    atk: '#ef4444',   
    def: '#3b82f6',   
    spAtk: '#a855f7', 
    spDef: '#06b6d4', 
    vel: '#ec4899'    
  };

  for (let i = 0; i < listaPokemonData.length; i++) {
    const p = listaPokemonData[i];
    const col = i % colCount;
    const row = Math.floor(i / colCount);

    const x = margin + (col * (cardWidth + margin));
    const y = margin + (row * (cardHeight + margin));

    // Fondo de la tarjeta
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#38bdf8'; 
    ctx.lineWidth = 2;
    drawRoundRect(ctx, x, y, cardWidth, cardHeight, 15, true, true);

    // Cabecera
    ctx.fillStyle = '#f8fafc'; 
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(p.nombre.toUpperCase(), x + 20, y + 40);

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Nv. ${p.nivel || 1} | ${p.experiencia || 0} XP`, x + cardWidth - 20, y + 40);
    ctx.textAlign = 'left'; 

    // Línea separadora
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 55);
    ctx.lineTo(x + cardWidth - 20, y + 55);
    ctx.strokeStyle = '#334155';
    ctx.stroke();

    // Renderizado de Estadísticas
    const statsInfo = [
      { label: 'HP', value: p.hp, color: statColors.hp },
      { label: 'ATK', value: p.atk, color: statColors.atk },
      { label: 'DEF', value: p.def, color: statColors.def },
      { label: 'SP.ATK', value: p.spAtk, color: statColors.spAtk },
      { label: 'SP.DEF', value: p.spDef, color: statColors.spDef },
      { label: 'VEL', value: p.vel, color: statColors.vel }
    ];

    const statsX = x + 180; 
    const startY = y + 80;
    const barWidth = 200; // Barra un poco más ancha
    const barHeight = 16; // Barra un poco más alta para que quepa el número
    const maxStat = 500; 

    statsInfo.forEach((stat, index) => {
      const currentY = startY + (index * 28);
      
      // Texto de la estadística (Label izquierdo)
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(stat.label, statsX, currentY + 13);
      
      // Fondo oscuro de la barra (Track)
      ctx.fillStyle = '#0f172a';
      drawRoundRect(ctx, statsX + 65, currentY, barWidth, barHeight, 8, true, false);

      // Relleno de color de la barra (Progress)
      const fillWidth = Math.min((stat.value / maxStat) * barWidth, barWidth);
      ctx.fillStyle = stat.color;
      drawRoundRect(ctx, statsX + 65, currentY, Math.max(fillWidth, 10), barHeight, 8, true, false);

      // Valor numérico EN EL CENTRO de la barra
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      
      // Sombreado sutil para garantizar que el texto se lea sobre colores claros
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;

      // Se dibuja el texto justo en el centro de la barra
      ctx.fillText(stat.value, statsX + 65 + (barWidth / 2), currentY + 12);

      // Importante: resetear las sombras para que no afecten a los siguientes dibujos
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    });

    // Renderizado del Sprite
    ctx.beginPath();
    ctx.arc(x + 100, y + 150, 70, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 4;
    ctx.stroke();

    if (p.spriteUrl) {
      try {
        const sprite = await loadImage(p.spriteUrl);
        ctx.drawImage(sprite, x + 30, y + 80, 140, 140);
      } catch (e) { 
        console.error(`Error cargando sprite de ${p.nombre}:`, e); 
      }
    }
  }

  return canvas.toBuffer('image/png');
}

async function generarImagenVersus(poke1, poke2) {
  const canvasWidth = 600;
  const canvasHeight = 320;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Fondo oscuro del campo de batalla
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Renderizado de Sprites
  try {
    if (poke1.url) {
      const img1 = await loadImage(poke1.url);
      ctx.drawImage(img1, 40, 40, 200, 200);
    }
    if (poke2.url) {
      const img2 = await loadImage(poke2.url);
      ctx.drawImage(img2, 360, 40, 200, 200);
    }
  } catch (error) {
    console.error('Error cargando sprites para el VS:', error);
  }

  // Renderizado del "VS" central
  ctx.fillStyle = '#ef4444'; // Rojo vibrante
  ctx.font = 'bold 70px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Sombreado para resaltar el texto
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 10;
  ctx.fillText('VS', canvasWidth / 2, canvasHeight / 2 - 20);
  ctx.shadowBlur = 0; // Resetear sombra

  // Nombres de los contrincantes
  ctx.fillStyle = '#f8fafc'; // Blanco
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(poke1.nombre.toUpperCase(), 140, 280);
  ctx.fillText(poke2.nombre.toUpperCase(), 460, 280);

  return canvas.toBuffer('image/png');
}

// No olvides exportarla al final del archivo:
module.exports = { generarCollagePokemon, generarImagenVersus };