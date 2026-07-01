const db = require('../services/database'); // Asegúrate de que la ruta a tu 'database.js' sea correcta
const { replyText } = require('../services/reply');

async function handleRanking(msg) {
  try {
    // 1. TOP 3 JUGADORES DE MAYOR NIVEL
    const [topNivelUsuarios] = await db.execute(`
      SELECT nombre_whatsapp, nivel, experiencia 
      FROM usuarios 
      ORDER BY nivel DESC, experiencia DESC 
      LIMIT 3
    `);

    // 2. TOP 3 ENTRENADORES CON MÁS POKÉMON
    const [topMasPokemon] = await db.execute(`
      SELECT u.nombre_whatsapp, COUNT(pa.id) AS total_pokemon 
      FROM usuarios u 
      LEFT JOIN pokemon_atrapados pa ON u.id = pa.usuario_id 
      GROUP BY u.id 
      ORDER BY total_pokemon DESC 
      LIMIT 3
    `);

    // 3. TOP 3 POKÉMON CON MÁS BATALLAS
    const [topMasBatallas] = await db.execute(`
      SELECT pa.nombre, IFNULL(pa.combates, 0) AS combates, u.nombre_whatsapp 
      FROM pokemon_atrapados pa 
      JOIN usuarios u ON pa.usuario_id = u.id 
      ORDER BY combates DESC 
      LIMIT 3
    `);

    // 4. EXTRA: TOP 3 ENTRENADORES MÁS RICOS (MONEDAS)
    const [topMonedas] = await db.execute(`
      SELECT nombre_whatsapp, monedas 
      FROM usuarios 
      ORDER BY monedas DESC 
      LIMIT 3
    `);

    // 5. EXTRA: TOP 3 POKÉMON CON MAYOR NIVEL INDIVIDUAL
    const [topNivelPokemon] = await db.execute(`
      SELECT pa.nombre, pa.nivel, u.nombre_whatsapp 
      FROM pokemon_atrapados pa 
      JOIN usuarios u ON pa.usuario_id = u.id 
      ORDER BY pa.nivel DESC, pa.experiencia DESC 
      LIMIT 3
    `);

    // --- CONSTRUCCIÓN DEL MENSAJE ---
    let mensaje = `🏆 *¡SALÓN DE LA FAMA POKÉMON!* 🏆\r\n`;
    mensaje += `────────────────────────\r\n\r\n`;

    // Medallas decorativas para los tops
    const medallas = ['🥇', '🥈', '🥉'];

    // Sección 1: Nivel de Entrenadores
    mensaje += `🏅 *TOP 3 ENTRENADORES DE MAYOR NIVEL*\r\n`;
    if (topNivelUsuarios.length === 0) mensaje += `  _No hay datos disponibles_\r\n`;
    topNivelUsuarios.forEach((user, idx) => {
      mensaje += `  ${medallas[idx]} *${user.nombre_whatsapp}* - Nivel ${user.nivel} (${user.experiencia} XP)\r\n`;
    });
    mensaje += `\r\n`;

    // Sección 2: Más Capturas
    mensaje += `🎒 *TOP 3 COLECCIONISTAS (MÁS POKÉMON)*\r\n`;
    if (topMasPokemon.length === 0) mensaje += `  _No hay datos disponibles_\r\n`;
    topMasPokemon.forEach((user, idx) => {
      mensaje += `  ${medallas[idx]} *${user.nombre_whatsapp}* - ${user.total_pokemon} Pokémon\r\n`;
    });
    mensaje += `\r\n`;

    // Sección 3: Más Batallas
    mensaje += `⚔️ *TOP 3 POKÉMON MÁS EXPERIMENTADOS EN COMBATE*\r\n`;
    if (topMasBatallas.length === 0) mensaje += `  _No hay datos disponibles_\r\n`;
    topMasBatallas.forEach((poke, idx) => {
      mensaje += `  ${medallas[idx]} *${poke.nombre}* (${poke.combates} combates) - de _${poke.nombre_whatsapp}_\r\n`;
    });
    mensaje += `\r\n`;

    // Sección 4: Más Ricos (Monedas)
    mensaje += `💰 *TOP 3 ENTRENADORES MÁS RICOS*\r\n`;
    if (topMonedas.length === 0) mensaje += `  _No hay datos disponibles_\r\n`;
    topMonedas.forEach((user, idx) => {
      mensaje += `  ${medallas[idx]} *${user.nombre_whatsapp}* - ${user.monedas} $\r\n`;
    });
    mensaje += `\r\n`;

    // Sección 5: Pokémon Más Fuertes (Nivel)
    mensaje += `🌟 *TOP 3 POKÉMON CON MAYOR NIVEL INDIVIDUAL*\r\n`;
    if (topNivelPokemon.length === 0) mensaje += `  _No hay datos disponibles_\r\n`;
    topNivelPokemon.forEach((poke, idx) => {
      mensaje += `  ${medallas[idx]} *${poke.nombre}* (Niv. ${poke.nivel}) - de _${poke.nombre_whatsapp}_\r\n`;
    });

    await replyText(msg, mensaje);
  } catch (error) {
    console.error('Error al generar el #ranking:', error);
    await replyText(msg, '⚠️ Hubo un error al obtener la tabla de clasificación.');
  }
}

module.exports = { handleRanking };