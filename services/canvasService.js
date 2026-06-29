const { createCanvas, loadImage } = require('canvas');

async function generarCollagePokemon(listaPokemonData) {
  const colCount = 2;
  const rowCount = 3;
  const cardWidth = 380; // Un poco más ancho para que quepan los textos
  const cardHeight = 280; // Un poco más alto
  const margin = 15;

  const canvasWidth = (colCount * cardWidth) + ((colCount + 1) * margin);
  const canvasHeight = (rowCount * cardHeight) + ((rowCount + 1) * margin);

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#2c3e50'; 
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  for (let i = 0; i < listaPokemonData.length; i++) {
    const p = listaPokemonData[i];
    const col = i % colCount;
    const row = Math.floor(i / colCount);

    const x = margin + (col * (cardWidth + margin));
    const y = margin + (row * (cardHeight + margin));

    // Fondo tarjeta
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, cardWidth, cardHeight);

    // Nombre
    ctx.fillStyle = '#2c3e50';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`${p.nombre.toUpperCase()} (Nv.${p.nivel})`, x + 10, y + 30);
    
    // Stats Completas
    ctx.font = '16px Arial';
    const stats = [
      `HP: ${p.hp}`, `ATK: ${p.atk}`, `DEF: ${p.def}`,
      `SP.ATK: ${p.spAtk}`, `SP.DEF: ${p.spDef}`, `VEL: ${p.vel}`
    ];
    
    stats.forEach((stat, index) => {
      ctx.fillText(stat, x + 10, y + 60 + (index * 25));
    });

    // Sprite
    if (p.spriteUrl) {
      try {
        const sprite = await loadImage(p.spriteUrl);
        ctx.drawImage(sprite, x + 230, y + 80, 130, 130);
      } catch (e) { console.error("Error sprite", e); }
    }
  }

  return canvas.toBuffer('image/png');
}

module.exports = { generarCollagePokemon };