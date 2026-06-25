const usuarioService = require('../services/usuarioService');
const pokemonService = require('../services/pokemonService');
const { replyText } = require('../services/reply');

async function handlePokeStats(msg, targetId = null) {
  try {
    const whatsappId = targetId || (msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0]);
    const usuario = await usuarioService.obtenerUsuario(whatsappId);

    if (!usuario) {
      const response = targetId
        ? '❌ El entrenador mencionado no está registrado en la base de datos.'
        : '🛑 No tienes un perfil creado todavía. Usa *#pokeregister* para registrarte.';
      return await msg.reply(response);
    }

    const totalCapturas = await pokemonService.contarCapturas(whatsappId);
    const nivel = usuario.nivel || 1;
    const experiencia = usuario.experiencia || 0;
    const pokeballs = usuario.pokeballs || 0;
    const nombre = usuario.nombre_whatsapp || 'Entrenador';
    const Monedas = usuario.Monedas || 0;

    const mensaje =
      `📊 *ESTADÍSTICAS DE ENTRENADOR* 📊\r\n` +
      `────────────────────────\r\n` +
      `👤 *Nombre:* ${nombre}\r\n` +
      `🏅 *Nivel:* ${nivel}\r\n` +
      `⭐ *Experiencia:* ${experiencia} EXP\r\n` +
      `💰 *Monedas:* ${Monedas}\r\n` +
      `🎒 *Pokéballs:* ${pokeballs}\r\n` +
      `📦 *Pokémon capturados:* ${totalCapturas}`;

    await replyText(msg, mensaje);
  } catch (error) {
    console.error('Error en #pokestats:', error);
    await replyText(msg, '⚠️ Hubo un error al obtener tus estadísticas. Inténtalo de nuevo.');
  }
}

module.exports = { handlePokeStats };