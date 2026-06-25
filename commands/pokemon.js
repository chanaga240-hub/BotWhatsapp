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

    // 1. Lógica de búsqueda del Pokémon
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

    // 2. Procesamiento de datos y traducciones en paralelo
    const [nombre, habilidades, tipos] = await Promise.all([
      getNombreEspanol(data),
      getHabilidadesEspanol(data),
      Promise.resolve(getTiposEspanol(data)),
    ]);

    const idFormateado = String(data.id).padStart(3, '0');
    const altura = (data.height / 10).toFixed(1);
    const peso = (data.weight / 10).toFixed(1);

    // 3. Mapeo y filtrado de estadísticas
    const statsMap = {
      hp: '❤️ Vida',
      attack: '⚔️ Ataque',
      defense: '🛡️ Defensa',
      speed: '⚡ Velocidad',
    };

    const estadisticas = data.stats
      .filter((s) => statsMap[s.stat.name])
      .map((s) => `${statsMap[s.stat.name]}: *${s.base_stat}*`)
      .join('\r\n');

    // 4. Obtención de archivos multimedia (Imagen y Audio)
    const urlImagen = getImagen(data);
    const urlAudio = getAudioGrito(data); 

    // 5. Construcción del mensaje de texto
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
      `${estadisticas}`;

    // 6. Envío de la respuesta principal (Mensaje + Sticker)
    await replyWithSticker(msg, mensaje, urlImagen, nombre);
    console.log(`[Bot] Datos y sticker de ${nombre} enviados correctamente.`);

    // 7. Envío opcional del audio (Grito del Pokémon)
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