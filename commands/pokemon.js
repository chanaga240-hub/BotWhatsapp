const usuarioService = require('../services/usuarioService');

const {
  consultarPokemon,
  getImagen,
  getNombreEspanol,
  getHabilidadesEspanol,
  getTiposEspanol,
  randomPokemonId,
  getAudioGrito,
} = require('../services/pokeapi');
const { replyText, replyWithSticker, replyWithAudio } = require('../services/reply');

async function handlePokemon(msg, busqueda = null) {
  try {
    let data;

    if (busqueda) {
      console.log(`[${new Date().toLocaleTimeString()}] Buscando Pokémon por nombre: ${busqueda}...`);
      try {
        data = await consultarPokemon(busqueda);
      } catch {
        await replyText(
          msg,
          `❌ *Error:* No logré encontrar a un Pokémon llamado _"${busqueda}"_. ¡Revisa la ortografía!`
        );
        return;
      }
    } else {
      const randomId = randomPokemonId();
      data = await consultarPokemon(randomId);
    }

    const [nombre, habilidades, tipos] = await Promise.all([
      getNombreEspanol(data),
      getHabilidadesEspanol(data),
      Promise.resolve(getTiposEspanol(data)),
    ]);

    const idFormateado = String(data.id).padStart(3, '0');
    const altura = (data.height / 10).toFixed(1);
    const peso = (data.weight / 10).toFixed(1);

    const statsMap = {
      hp: '❤️ Vida',
      attack: '⚔️ Ataque',
      defense: '🛡️ Defensa',
      'special-attack': '💥 Atk. Especial',
      'special-defense': '🔰 Def. Especial',
      speed: '⚡ Velocidad',
    };

    const estadisticas = data.stats
      .filter((s) => statsMap[s.stat.name])
      .map((s) => `${statsMap[s.stat.name]}: *${s.base_stat}*`)
      .join('\r\n');

    const velocidadStat = data.stats.find(s => s.stat.name === 'speed');
    const velocidadBase = velocidadStat ? velocidadStat.base_stat : 0;
    let probEsquive = velocidadBase / 20;
    if (probEsquive > 30) probEsquive = 30;

    const urlImagen = getImagen(data);
    const urlAudio = getAudioGrito(data); 

    const mensaje =
      `✨ *¡POKÉMON AVISTADO!* ✨\r\n` +
      `──────────────────────\r\n\r\n` +
      `🆔 *Nº Pokédex:* #${idFormateado}\r\n\r\n` +
      `👤 *Nombre:* _${nombre}_\r\n\r\n` +
      `🏷️ *Tipo:* [ *${tipos}* ]\r\n\r\n` +
      `📊 *DATOS FÍSICOS*\r\n` +
      `• *Altura:* ${altura} m\r\n` +
      `• *Peso:* ${peso} kg\r\n` +
      `• *Habilidades:* _${habilidades}_\r\n\r\n` +
      `⚔️ *ESTADÍSTICAS BASE*\r\n` +
      `${estadisticas}\r\n` +
      `💨 *Prob. Esquivar:* ${probEsquive.toFixed(1)}%`;

    await replyWithSticker(msg, mensaje, urlImagen, nombre);
    console.log(`[Bot] Datos y sticker de ${nombre} enviados correctamente.`);

    if (urlAudio) {
      try {
        await replyWithAudio(msg, urlAudio); 
        console.log(`[Bot] Grito de ${nombre} enviado con éxito.`);
      } catch (audioError) {
        console.error(`[Bot] No se pudo enviar el audio:`, audioError.message);
      }
    } else {
      console.log(`[Bot] ${nombre} no tiene un audio disponible en la API.`);
    }

  } catch (error) {
    console.error('Error general en #pokemon:', error);
  }
}

module.exports = { handlePokemon };