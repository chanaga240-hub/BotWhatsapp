const pokemonService = require('../services/pokemonService');
const { replyText } = require('../services/reply');

async function handleUse(msg, texto) {
  const partes = texto.replace('#use', '').trim().split(' ');
  const item = partes[0]; // ej: "pocion_xp"
  const nombrePokemon = partes.slice(1).join(' '); // ej: "Pikachu"

  if (!item || !nombrePokemon) {
    return await replyText(msg, '❌ Formato: `#use pocion_xp (nombre_pokemon)`');
  }

  const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];

  if (item === 'pocion_xp') {
    const resultado = await pokemonService.usarPocionXp(whatsappId, nombrePokemon);
    
    if (resultado.error === 'sin_objetos') return await replyText(msg, '🧪 No tienes Pociones XP Small en tu inventario.');
    if (resultado.error === 'pokemon_no_encontrado') return await replyText(msg, '❌ No tienes un Pokémon con ese nombre.');
    
    return await replyText(msg, `✅ ¡Has usado una Poción XP en *${resultado.nombre}*! (+50 XP)`);
  }

  return await replyText(msg, '❌ Ese objeto no se puede usar o no existe.');
}

module.exports = { handleUse };