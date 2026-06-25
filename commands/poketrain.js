const pokemonService = require('../services/pokemonService');
const { replyText } = require('../services/reply');

async function handlePokeTrain(msg, nombrePokemon) {
  try {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    const resultado = await pokemonService.entrenarPokemon(whatsappId, nombrePokemon);

    if (!resultado) {
      return await replyText(msg, '⚠️ Ocurrió un error inesperado al entrenar tu Pokémon. Intenta de nuevo más tarde.');
    }

    if (resultado.error === 'not_found') {
      return await replyText(msg, `❌ No tienes a ningún *${nombrePokemon}* registrado en tu Pokédex.`);
    }

    if (resultado.error === 'cooldown') {
      const { minutos, segundos } = resultado.remaining;
      return await replyText(msg,
        `⏳ Este Pokémon ya fue entrenado recientemente.\nVuelve a intentarlo en *${minutos} minutos y ${segundos} segundos*.`
      );
    }

    if (resultado.error === 'db_error') {
      return await replyText(msg, '⚠️ Hubo un problema al actualizar la experiencia en la base de datos. Intenta de nuevo.');
    }

    if (resultado.success) {
    const poke = resultado.pokemon;
    const progreso = poke.experienciaNueva % 100; // Asumiendo que 100 es el tope
    
    return await replyText(msg,
        `🏋️‍♂️ *¡SESIÓN DE ENTRENAMIENTO COMPLETADA!* 🏋️‍♂️\n` +
        `──────────────────────\n` +
        `🌟 *${poke.nombre}* ha recibido un entrenamiento intensivo.\n` +
        `📈 *Experiencia:* ${poke.experienciaAnterior} ➔ *${poke.experienciaNueva}* (+5 EXP)\n\n` +
        `📊 *Progreso al próximo nivel:* [${'█'.repeat(Math.floor(progreso / 10))}${'░'.repeat(10 - Math.floor(progreso / 10))}] ${progreso}%\n` +
        `──────────────────────\n` +
        `💬 _"${poke.nombre} se ve más fuerte que hace un momento."_`
    );
}

    return await replyText(msg, '⚠️ No se pudo completar el entrenamiento.');
  } catch (error) {
    console.error('Error en #poketrain:', error);
    await replyText(msg, '⚠️ Hubo un error al procesar el comando #poketrain. Inténtalo de nuevo.');
  }
}

module.exports = { handlePokeTrain };