const pokemonService = require('../services/pokemonService');
const usuarioService = require('../services/usuarioService');

function getNombreRemitente(msg) {
  return msg._data?.notifyName || msg.pushname || 'Entrenador';
}

async function handlePokeGive(msg, textoCompleto) {
  try {
    const isGroup = msg.from.endsWith('@g.us');

    if (!isGroup) {
      return await msg.reply('❌ Este comando debe usarse dentro de un grupo y mencionando a otro entrenador.');
    }

    let mentionIds = msg.mentionedIds || [];
    // Si necesitas obtener menciones de forma robusta sin getChat:
    if (mentionIds.length === 0 && typeof msg.getMentions === 'function') {
      try {
        const mentions = await msg.getMentions();
        mentionIds = mentions
          .map((m) => (m.id && m.id._serialized ? m.id._serialized : ''))
          .filter(Boolean);
      } catch (e) {
        // Fallback silencioso si falla getMentions
      }
    }

    if (mentionIds.length === 0) {
      return await msg.reply('❌ Debes mencionar a un entrenador con @ para donar tu Pokémon.\n👉 Ejemplo: #pokegive @Marco Pikachu');
    }

    const destinatarioId = mentionIds[0].split('@')[0].split(':')[0];
    const remitenteId = (msg.author || msg.from).split('@')[0].split(':')[0];

    if (destinatarioId === remitenteId) {
      return await msg.reply('❌ No puedes donar un Pokémon a ti mismo.');
    }

    const destinatario = await usuarioService.obtenerUsuario(destinatarioId);
    if (!destinatario) {
      return await msg.reply('❌ El entrenador mencionado no está registrado. Pídele que use *#pokeregister* primero.');
    }

    let textoLimpio = textoCompleto.replace(/^#pokegive/i, '').trim();
    textoLimpio = textoLimpio.replace(/@\d+/g, '').trim();

    if (!textoLimpio) {
      return await msg.reply('❌ Debes indicar el nombre del Pokémon que deseas donar.\n👉 Ejemplo: #pokegive @Marco Pikachu');
    }

    const pokemon = await pokemonService.verificarYObtenerPokemon(remitenteId, textoLimpio);
    if (!pokemon) {
      return await msg.reply(`❌ No encontré a ningún *${textoLimpio}* en tu Pokédex.`);
    }

    const equipo = await pokemonService.obtenerEquipoPokemon(remitenteId);
    const enEquipo = equipo.find(p => p.nombre.toLowerCase() === pokemon.nombre.toLowerCase());
    if (enEquipo) {
        return await msg.reply(`🛡️ No puedes donar a *${pokemon.nombre}* porque está asignado a la posición ${enEquipo.jerarquia} de tu equipo titular. ¡Sácalo del equipo si deseas transferirlo!`);
    }

    const expediciones = await pokemonService.obtenerExpediciones(remitenteId);
    if (expediciones.find(p => p.pokemon_id === pokemon.id)) {
        return await msg.reply(`🏕️ No puedes donar a *${pokemon.nombre}* porque se encuentra de expedición en este momento. Espera su regreso.`);
    }

    const transferencia = await pokemonService.transferirPokemon(pokemon.id, destinatario.id);
    if (!transferencia) {
      return await msg.reply('⚠️ No se pudo completar la donación. Intenta de nuevo más tarde.');
    }

    const nombreDestinatario = destinatario.nombre_whatsapp || destinatarioId;
    return await msg.reply(
      `✅ ¡Donación completada!\n\n` +
      `👤 *De:* ${getNombreRemitente(msg)}\n` +
      `👤 *Para:* ${nombreDestinatario}\n` +
      `👾 *Pokémon:* ${pokemon.nombre} (Nivel ${pokemon.nivel || 1})`
    );
  } catch (error) {
    console.error('Error en #pokegive:', error);
    return await msg.reply('⚠️ Ocurrió un error al procesar la donación. Intenta de nuevo.');
  }
}

module.exports = { handlePokeGive };
