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

    // <-- NUEVO BLOQUE: Renderizado de los Tipos -->
    ctx.fillStyle = '#38bdf8'; // Usamos un color azul claro que resalte
    ctx.font = 'italic 16px sans-serif';
    ctx.fillText(`[ ${p.tipos} ]`, x + 20, y + 65);
    // <------------------------------------------->

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'right';
    // Ajustamos un poco la altura (y + 40 a y + 50 si ves que queda muy pegado)
    ctx.fillText(`Nv. ${p.nivel || 1} | ${p.experiencia || 0} XP`, x + cardWidth - 20, y + 40);
    ctx.textAlign = 'left';

    // Línea separadora
    ctx.beginPath();
    ctx.moveTo(x + 20, y + 75); // <-- AJUSTADO
    ctx.lineTo(x + cardWidth - 20, y + 75); // <-- AJUSTADO
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

async function generarSilueta(urlImagen) {
  try {
    const img = await loadImage(urlImagen);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');

    // Dibujar la imagen original
    ctx.drawImage(img, 0, 0);

    // Cambiar la composición para pintar solo donde ya hay pixeles no transparentes
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#000000'; // Negro total
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Error al generar silueta:', error);
    return null;
  }
}

async function generarImagenIncubadora(huevosEnEspera) {
  const canvasWidth = 800;
  const canvasHeight = 350;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Fondo principal oscuro
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Título superior
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('♨️ INCUBADORA POKÉMON ♨️', canvasWidth / 2, 45);

  // Configuración de las 3 ranuras (límite máximo de incubación)
  const maxHuevos = 3;
  const slotWidth = 220;
  const slotHeight = 240;
  const margin = (canvasWidth - (maxHuevos * slotWidth)) / (maxHuevos + 1);

  for (let i = 0; i < maxHuevos; i++) {
    const x = margin + (i * (slotWidth + margin));
    const y = 80;

    // Fondo de la ranura de incubación
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#38bdf8'; 
    ctx.lineWidth = 3;
    drawRoundRect(ctx, x, y, slotWidth, slotHeight, 20, true, true);

    const huevo = huevosEnEspera[i];

    if (huevo) {
      // DIBUJAR HUEVO ESTILO POKÉMON
      const centerX = x + (slotWidth / 2);
      const centerY = y + 100;

      // Sombra del huevo
      ctx.beginPath();
      ctx.ellipse(centerX, centerY + 65, 45, 15, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fill();

      // Forma base del huevo
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, 55, 75, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fdfbf7'; // Color crema/blanco
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#cbd5e1';
      ctx.stroke();

      // Manchas verdes (estilo huevo clásico)
      ctx.fillStyle = '#4ade80';
      ctx.beginPath(); ctx.ellipse(centerX - 25, centerY + 20, 15, 20, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(centerX + 30, centerY - 15, 12, 18, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(centerX, centerY - 45, 18, 12, 0, 0, Math.PI * 2); ctx.fill();

      // Brillo del cristal de la incubadora encima del huevo
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, 65, 85, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
      ctx.fill();

      // TEXTO DEL CONTADOR
      ctx.fillStyle = '#ef4444'; // Rojo para destacar el tiempo
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${huevo.horas}h ${huevo.minutos}m`, centerX, y + 210);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '16px sans-serif';
      ctx.fillText('Restantes', centerX, y + 230);

    } else {
      // RANURA VACÍA
      const centerX = x + (slotWidth / 2);
      
      // Icono de vacío (un círculo hueco punteado)
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.arc(centerX, y + 110, 40, 0, Math.PI * 2);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]); // Restaurar líneas sólidas

      // Texto de ranura vacía
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('VACÍO', centerX, y + 210);
    }
  }

  return canvas.toBuffer('image/png');
}

async function generarImagenPoketeam(equipoArray) {
  // El equipoArray siempre tendrá 6 posiciones (algunas pueden ser null)
  const colCount = 2;
  const rowCount = 3;
  const cardWidth = 460; 
  const cardHeight = 260; 
  const margin = 25;

  const canvasWidth = (colCount * cardWidth) + ((colCount + 1) * margin);
  const canvasHeight = (rowCount * cardHeight) + ((rowCount + 1) * margin);

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Fondo principal oscuro
  ctx.fillStyle = '#0f172a'; 
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const statColors = {
    hp: '#22c55e', atk: '#ef4444', def: '#3b82f6', 
    spAtk: '#a855f7', spDef: '#06b6d4', vel: '#ec4899'    
  };

  // Pintamos exactamente 6 slots
  for (let i = 0; i < 6; i++) {
    const p = equipoArray[i]; 
    const col = i % colCount;
    const row = Math.floor(i / colCount);

    const x = margin + (col * (cardWidth + margin));
    const y = margin + (row * (cardHeight + margin));

    // Fondo de la tarjeta
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = p ? '#38bdf8' : '#334155'; // Azul si hay poke, gris si está vacío
    ctx.lineWidth = 2;
    drawRoundRect(ctx, x, y, cardWidth, cardHeight, 15, true, true);

    if (p) {
      // SI HAY POKÉMON EN ESTE SLOT:
      ctx.fillStyle = '#f8fafc'; 
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`[${i + 1}] ${p.nombre.toUpperCase()}`, x + 20, y + 40);

      ctx.fillStyle = '#38bdf8'; 
      ctx.font = 'italic 16px sans-serif';
      ctx.fillText(`[ ${p.tipos} ]`, x + 20, y + 65);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`Nv. ${p.nivel || 1} | ${p.experiencia || 0} XP`, x + cardWidth - 20, y + 40);
      ctx.textAlign = 'left';

      // Línea separadora
      ctx.beginPath();
      ctx.moveTo(x + 20, y + 75); 
      ctx.lineTo(x + cardWidth - 20, y + 75); 
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
      const barWidth = 200; 
      const barHeight = 16; 
      const maxStat = 500; 

      statsInfo.forEach((stat, index) => {
        const currentY = startY + (index * 28);
        
        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(stat.label, statsX, currentY + 13);
        
        ctx.fillStyle = '#0f172a';
        drawRoundRect(ctx, statsX + 65, currentY, barWidth, barHeight, 8, true, false);

        const fillWidth = Math.min((stat.value / maxStat) * barWidth, barWidth);
        ctx.fillStyle = stat.color;
        drawRoundRect(ctx, statsX + 65, currentY, Math.max(fillWidth, 10), barHeight, 8, true, false);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillText(stat.value, statsX + 65 + (barWidth / 2), currentY + 12);

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      });

      // Fondo del sprite
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
    } else {
      // SI NO HAY POKÉMON EN ESTE SLOT (ESTÁ VACÍO):
      ctx.fillStyle = '#475569'; 
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`POSICIÓN ${i + 1}`, x + (cardWidth / 2), y + 80);

      // Dibujar un círculo punteado vacío
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.arc(x + (cardWidth / 2), y + 160, 50, 0, Math.PI * 2);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.setLineDash([]); // Resetear líneas punteadas

      ctx.font = '16px sans-serif';
      ctx.fillText('VACÍO', x + (cardWidth / 2), y + 165);
    }
  }

  return canvas.toBuffer('image/png');
}

// ==========================================
// NUEVO: GENERADOR DE IMAGEN DEL INVENTARIO
// ==========================================
async function generarImagenInventario(inv, nombreEntrenador) {
  const colCount = 4; 
  const rowCount = 2; 
  const cardWidth = 200; 
  const cardHeight = 180; 
  const margin = 20;

  const canvasWidth = (colCount * cardWidth) + ((colCount + 1) * margin);
  // Añadimos espacio arriba para el título
  const canvasHeight = (rowCount * cardHeight) + ((rowCount + 1) * margin) + 100;

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Fondo
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Título Superior
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`🎒 INVENTARIO DE ${nombreEntrenador.toUpperCase()}`, canvasWidth / 2, 60);

  // Mapeamos los datos del inventario a un formato que el canvas pueda dibujar fácilmente
  const items = [
    { label: 'MONEDAS', value: inv.monedas || 0, icon: '💰', color: '#fbbf24' },
    { label: 'POKÉBALLS', value: inv.pokeballs || 0, icon: '🔴', color: '#ef4444' },
    { label: 'POCIÓN XP', value: inv.pocion_xp_small || 0, icon: '🧪', color: '#38bdf8' },
    { label: 'ROCAS EVOL.', value: inv.rocas_evolutivas || 0, icon: '🪨', color: '#a855f7' },
    { label: 'PUNTA ADN', value: inv.punta_adn || 0, icon: '🧬', color: '#22c55e' },
    { label: 'HUEVOS', value: inv.egg || 0, icon: '🥚', color: '#fef3c7' },
    { label: 'MEGA ENERGÍA', value: inv.mega_energia || 0, icon: '🧿', color: '#f472b6' },
    { label: 'LLAVE MAZMORRA', value: inv.llave_mazmorra || 0, icon: '🗝️', color: '#94a3b8' }
  ];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const col = i % colCount;
    const row = Math.floor(i / colCount);

    const x = margin + (col * (cardWidth + margin));
    const y = 100 + margin + (row * (cardHeight + margin)); // El +100 es por el título

    // Fondo del cuadro del objeto
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = item.color; 
    ctx.lineWidth = 2;
    drawRoundRect(ctx, x, y, cardWidth, cardHeight, 15, true, true);

    // Ícono gigante en el centro
    ctx.fillStyle = '#ffffff'; 
    ctx.font = '60px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.icon, x + (cardWidth / 2), y + 75);

    // Nombre del objeto
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(item.label, x + (cardWidth / 2), y + 120);

    // Cantidad del objeto (Resaltada)
    ctx.fillStyle = item.color;
    ctx.font = 'bold 36px sans-serif';
    
    // Si la cantidad es 0, lo ponemos un poco más opaco para que se note vacío
    if (item.value === 0) ctx.fillStyle = '#475569'; 

    ctx.fillText(`x${item.value}`, x + (cardWidth / 2), y + 165);
  }

  return canvas.toBuffer('image/png');
}

// === ACTUALIZA ESTA LÍNEA AL FINAL ===
module.exports = { generarCollagePokemon, generarImagenVersus, generarSilueta, generarImagenIncubadora, generarImagenPoketeam, generarImagenInventario };