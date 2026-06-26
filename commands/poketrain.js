const pokemonService = require('../services/pokemonService');
const usuarioService = require('../services/usuarioService'); // <-- Importamos para verificar el nivel
const { replyText } = require('../services/reply');

async function handlePokeTrain(msg, nombrePokemon) {
  try {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    const nombreBuscado = (nombrePokemon || msg.body?.replace(/^#poketrain/i, '') || '').trim();

    // ==========================================================
    // CASO NUEVO: ENTRENAMIENTO MASIVO (ALL)
    // ==========================================================
    if (nombreBuscado.toLowerCase() === 'all') {
      // 1. Obtener datos del entrenador para validar su nivel
      const usuario = await usuarioService.obtenerUsuario(whatsappId);
      if (!usuario) return await replyText(msg, '❌ No estás registrado como entrenador.');

      // ⚠️ Calcula el nivel del entrenador. Si tienes columna 'nivel', usará esa. 
      // Si no, lo calcula automáticamente por experiencia (cada 100 XP = 1 nivel).
      const nivelEntrenador = usuario.nivel || Math.floor((usuario.experiencia || 0) / 100) + 1;

      // 2. Validar nivel requerido (Nivel 5)
      if (nivelEntrenador < 5) {
        return await replyText(msg, `⛔ *Acceso Denegado*\nEl comando \`#poketrain all\` es una técnica avanzada solo disponible para entrenadores de *Nivel 5 o superior*.\n(Tu nivel actual de entrenador es: ${nivelEntrenador})`);
      }

      // 3. Ejecutar entrenamiento masivo
      const resultadoAll = await pokemonService.entrenarTodosListos(whatsappId);
      
      if (resultadoAll.error) {
        return await replyText(msg, '⚠️ Ocurrió un error al intentar el entrenamiento masivo en la base de datos.');
      }

      if (resultadoAll.entrenados === 0) {
        return await replyText(msg, '⏳ Todos tus Pokémon están exhaustos en este momento. ¡Déjalos descansar!');
      }

      // 4. Armar el mensaje de éxito
      let msgAll = `🏋️‍♂️ *¡ENTRENAMIENTO MASIVO COMPLETADO!* 🏋️‍♂️\n──────────────────────\n`;
      msgAll += `✅ Has entrenado a *${resultadoAll.entrenados} Pokémon* simultáneamente (+5 EXP a cada uno).\n`;
      
      if (resultadoAll.subieron.length > 0) {
        msgAll += `\n✨ *¡${resultadoAll.subieron.length} SUBIERON DE NIVEL!* ✨\n`;
        resultadoAll.subieron.forEach(p => {
          msgAll += `🔸 *${p.nombre}* ➔ Nivel ${p.nivel}\n`;
        });
      }
      msgAll += `──────────────────────`;
      
      return await replyText(msg, msgAll);
    }

    // ==========================================================
    // CASO COMPLEMENTARIO: MOSTRAR LISTA PENDIENTE
    // ==========================================================
    if (!nombreBuscado) {
      const todos = await pokemonService.obtenerPokemonParaEntrenamiento(whatsappId);
      
      if (todos.length === 0) {
        return await replyText(msg, '🎒 No tienes ningún Pokémon en tu Pokédex para entrenar. ¡Captura alguno primero!');
      }

      const ahora = new Date();
      const cooldownMs = 30 * 60 * 1000; 

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

      mensajeLista += `──────────────────────\n👉 _Entrena a uno usando:_ *#poketrain [nombre]*\n👉 _Entrena a todos:_ *#poketrain all* (Lv. 5+)`;

      return await replyText(msg, mensajeLista);
    }

    // ==========================================================
    // LÓGICA DE ENTRENAMIENTO INDIVIDUAL
    // ==========================================================
    const resultado = await pokemonService.entrenarPokemon(whatsappId, nombreBuscado);

    if (!resultado) {
      return await replyText(msg, '⚠️ Ocurrió un error inesperado al entrenar tu Pokémon.');
    }

    if (resultado.error === 'not_found') {
      return await replyText(msg, `❌ No tienes a ningún *${nombreBuscado}* registrado en tu Pokédex.`);
    }

    if (resultado.error === 'cooldown') {
      const { minutos, segundos } = resultado.remaining;
      return await replyText(msg, `⏳ Este Pokémon ya fue entrenado recientemente.\nVuelve a intentarlo en *${minutos} minutos y ${segundos} segundos*.`);
    }

    if (resultado.error === 'db_error') {
      return await replyText(msg, '⚠️ Hubo un problema al actualizar la experiencia en la base de datos.');
    }

    if (resultado.success) {
      const poke = resultado.pokemon;
      
      const progreso = Math.min((poke.experiencia / poke.xpNecesaria) * 100, 100);
      const barraVisual = `[${'█'.repeat(Math.floor(progreso / 10))}${'░'.repeat(10 - Math.floor(progreso / 10))}]`;

      let mensajeExito = `🏋️‍♂️ *¡SESIÓN DE ENTRENAMIENTO COMPLETADA!* 🏋️‍♂️\n` +
          `──────────────────────\n` +
          `🌟 *${poke.nombre}* (Nivel ${poke.nivel})\n` +
          `📈 *Experiencia:* ${poke.experienciaAnterior} ➔ *${poke.experiencia}* (+5 EXP)\n\n` +
          `📊 *Progreso al próximo nivel:* ${barraVisual} ${progreso.toFixed(0)}%\n`;

      if (resultado.subioNivel) {
          mensajeExito += `✨ *¡FELICIDADES! ¡SUBISTE A NIVEL ${poke.nivel}!* ✨\n`;
      }

      mensajeExito += `──────────────────────`;

      return await replyText(msg, mensajeExito);
    }

    return await replyText(msg, '⚠️ No se pudo completar el entrenamiento.');
  } catch (error) {
    console.error('Error en #poketrain:', error);
    await replyText(msg, '⚠️ Hubo un error al procesar el comando #poketrain. Inténtalo de nuevo.');
  }
}

module.exports = { handlePokeTrain };