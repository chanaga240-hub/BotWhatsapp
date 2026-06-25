const pokemonService = require('../services/pokemonService');
const { replyText } = require('../services/reply');

async function handlePokeTrain(msg, nombrePokemon) {
  try {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    
    // Validamos de forma segura si el nombre viene por parámetro o directo en el body
    const nombreBuscado = (nombrePokemon || msg.body?.replace(/^#poketrain/i, '') || '').trim();

    // ==========================================================
    // CASO COMPLEMENTARIO: NO MANDÓ NOMBRE -> MOSTRAR LISTA PENDIENTE
    // ==========================================================
    if (!nombreBuscado) {
      const todos = await pokemonService.obtenerPokemonParaEntrenamiento(whatsappId);
      
      if (todos.length === 0) {
        return await replyText(msg, '🎒 No tienes ningún Pokémon en tu Pokédex para entrenar. ¡Captura alguno primero!');
      }

      const ahora = new Date();
      const cooldownMs = 30 * 60 * 1000; // Cooldown de 30 minutos coordinado con tu service

      let readyList = '';
      let cooldownList = '';

      todos.forEach((p) => {
        const ultima = p.fecha_entrenamiento ? new Date(p.fecha_entrenamiento) : null;
        const listo = !ultima || (ahora - ultima >= cooldownMs);

        if (listo) {
          readyList += `✅ *${p.nombre}* (Niv. ${p.nivel || 1})\n`;
        } else {
          const restanteMs = cooldownMs - (ahora - ultima);
          const minutos = Math.floor(restanteMs / (1000 * 60));
          const segundos = Math.floor((restanteMs % (1000 * 60)) / 1000);
          cooldownList += `⏳ *${p.nombre}* (Niv. ${p.nivel || 1}) - _Faltan ${minutos}m ${segundos}s_\n`;
        }
      });

      let mensajeLista = `🏋️‍♂️ *PANEL DE ENTRENAMIENTO* 🏋️‍♂️\n──────────────────────\n`;
      
      if (readyList) {
        mensajeLista += `📋 *Listos para entrenar (Pendientes):*\n${readyList}`;
      } else {
        mensajeLista += `❌ *Listos para entrenar:*\nNinguno. ¡Todos tus Pokémon están exhaustos!\n`;
      }

      if (cooldownList) {
        mensajeLista += `\n🕒 *En Descanso (Cooldown):*\n${cooldownList}`;
      }

      mensajeLista += `──────────────────────\n👉 _Entrena a uno usando:_ *#poketrain [nombre]*`;

      return await replyText(msg, mensajeLista);
    }

    // ==========================================================
    // LÓGICA DE ENTRENAMIENTO ORIGINAL (CUANDO SÍ HAY NOMBRE)
    // ==========================================================
    const resultado = await pokemonService.entrenarPokemon(whatsappId, nombreBuscado);

    if (!resultado) {
      return await replyText(msg, '⚠️ Ocurrió un error inesperado al entrenar tu Pokémon. Intenta de nuevo más tarde.');
    }

    if (resultado.error === 'not_found') {
      return await replyText(msg, `❌ No tienes a ningún *${nombreBuscado}* registrado en tu Pokédex.`);
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
      const progreso = poke.experienciaNueva % 100; 
      
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