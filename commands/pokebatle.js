const usuarioService = require('../services/usuarioService');
const {
  consultarPokemon,
  getStat,
  getImagen,
} = require('../services/pokeapi');
const { replyWithLabeledStickers } = require('../services/reply');
const pokemonService = require('../services/pokemonService');

// Mapa en memoria para almacenar los desafíos pendientes
const desafiosPendientes = new Map();

function getNombreRemitente(msg) {
  return msg._data?.notifyName || msg.pushname || 'Entrenador';
}

async function handlePokebatle(msg, argsText = '') {
  try {
    const chat = await msg.getChat();
    if (!chat.isGroup) {
      return await msg.reply('❌ Los desafíos de batalla solo se pueden organizar dentro de grupos.');
    }

    const menciones = msg.mentionedIds || [];
    if (menciones.length === 0) {
      return await msg.reply('❌ Debes mencionar (`@`) a un entrenador del grupo para retarlo.\n👉 Ejemplo: `#pokebatle @Marco Pikachu`');
    }

    // Limpiamos el ID del retador de sufijos de dispositivo (:66)
    const idRetador = (msg.author || msg.from).split('@')[0].split(':')[0];

    const objetosMenciones = await msg.getMentions();
    const contactoRival = objetosMenciones[0];

    if (!contactoRival) {
      return await msg.reply('❌ Debes mencionar (`@`) a un entrenador del grupo para retarlo.');
    }

    // Limpiamos el ID del rival
    const idRival = msg.mentionedIds[0].split('@')[0].split(':')[0];

    if (idRetador === idRival) {
      return await msg.reply('❌ No puedes retarte a una batalla a ti mismo.');
    }

    let textoLimpio = msg.body.replace(/^#pokebatle/i, '').trim();
    textoLimpio = textoLimpio.replace(/@\d+/g, '').trim();

    const nombrePokemonBuscado = textoLimpio;
    if (!nombrePokemonBuscado) {
      return await msg.reply('❌ Especifica con qué Pokémon de tu Pokédex vas a pelear.\n👉 Ejemplo: `#pokebatle @User Pikachu`');
    }

    const pokeInventarioRetador = await pokemonService.verificarYObtenerPokemon(idRetador, nombrePokemonBuscado);
    if (!pokeInventarioRetador) {
      return await msg.reply(`❌ No tienes a ningún *${nombrePokemonBuscado}* registrado en tu Pokédex.`);
    }

    // Verificar cooldown por combate (5 minutos)
    try {
      const cooldownMs = 5 * 60 * 1000;
      if (pokeInventarioRetador.fecha_ultimo_combate) {
        const ultima = new Date(pokeInventarioRetador.fecha_ultimo_combate);
        const ahora = new Date();
        const diff = ahora - ultima;
        if (diff < cooldownMs) {
          const restanteMs = cooldownMs - diff;
          const minutos = Math.floor(restanteMs / 60000);
          const segundos = Math.floor((restanteMs % 60000) / 1000);
          return await msg.reply(`⏳ Tu *${pokeInventarioRetador.nombre}* está en recuperación tras un combate. Tiempo restante: ${minutos}m ${segundos}s.`);
        }
      }
    } catch (e) {
      console.error('Error comprobando cooldown del Pokémon retador:', e);
    }

    const nombreRetadorText = getNombreRemitente(msg);
    const nombreRivalText = contactoRival.pushname || contactoRival.name || 'Entrenador';

    // Registramos el desafío usando el ID base limpio
    desafiosPendientes.set(idRival, {
      idRetador,
      nombreRetadorText,
      nombreRivalText,
      pokemonRetador: pokeInventarioRetador,
      msgOrigen: msg
    });

    return await msg.reply(
      `⚔️ *¡DESAFÍO LANZADO!* ⚔️\n\n` +
      `👤 *${nombreRetadorText}* ha retado a *${nombreRivalText}* a un combate Pokémon.\n` +
      `🔥 El retador enviará a: *${pokeInventarioRetador.nombre}* (Nivel ${pokeInventarioRetador.nivel})\n\n` +
      `Toque responder usando:\n` +
      `👉 *#pokeaccept [nombre_de_tu_pokemon]*`
    );

  } catch (error) {
    console.error('Error en el inicio de pokebatle:', error);
  }
}

async function handlePokeaccept(msg, pokemonRivalNombre = '') {
  try {
    // Limpiamos el sufijo del ID de quien acepta (:66) para que coincida con el mapa
    const idRival = (msg.author || msg.from).split('@')[0].split(':')[0];

    // Ahora sí coincidirán las llaves en la memoria
    if (!desafiosPendientes.has(idRival)) {
      return await msg.reply('❌ No tienes ningún desafío de batalla pendiente por aceptar.');
    }

    const nombrePokemonBuscado = pokemonRivalNombre.trim();
    if (!nombrePokemonBuscado) {
      return await msg.reply('❌ Especifica el nombre del Pokémon de tu Pokédex con el que vas a defenderte.');
    }

    const pokeInventarioRival = await pokemonService.verificarYObtenerPokemon(idRival, nombrePokemonBuscado);
    if (!pokeInventarioRival) {
      return await msg.reply(`❌ No tienes a ningún *${nombrePokemonBuscado}* registrado en tu Pokédex.`);
    }

    const desafio = desafiosPendientes.get(idRival);
    desafiosPendientes.delete(idRival); 

    await msg.reply(`⏳ ¡Desafío aceptado! Preparando el campo de batalla para *${desafio.pokemonRetador.nombre}* vs *${pokeInventarioRival.nombre}*...`);

    // Verificar cooldowns para ambos Pokémon (retador y rival)
    try {
      const cooldownMs = 5 * 60 * 1000;
      // Re-consultar el Pokémon del retador en base de datos (podría haber cambiado)
      const pokeRetadorActual = await pokemonService.verificarYObtenerPokemon(desafio.idRetador, desafio.pokemonRetador.nombre);
      if (pokeRetadorActual && pokeRetadorActual.fecha_ultimo_combate) {
        const ultima = new Date(pokeRetadorActual.fecha_ultimo_combate);
        const ahora = new Date();
        const diff = ahora - ultima;
        if (diff < cooldownMs) {
          const restanteMs = cooldownMs - diff;
          const minutos = Math.floor(restanteMs / 60000);
          const segundos = Math.floor((restanteMs % 60000) / 1000);
          return await msg.reply(`⏳ El Pokémon del retador (*${pokeRetadorActual.nombre}*) está en recuperación. Tiempo restante: ${minutos}m ${segundos}s. No se puede aceptar el combate ahora.`);
        }
      }

      if (pokeInventarioRival.fecha_ultimo_combate) {
        const ultimaR = new Date(pokeInventarioRival.fecha_ultimo_combate);
        const ahoraR = new Date();
        const diffR = ahoraR - ultimaR;
        if (diffR < cooldownMs) {
          const restanteMs = cooldownMs - diffR;
          const minutos = Math.floor(restanteMs / 60000);
          const segundos = Math.floor((restanteMs % 60000) / 1000);
          return await msg.reply(`⏳ Tu *${pokeInventarioRival.nombre}* está en recuperación. Tiempo restante: ${minutos}m ${segundos}s. No puedes aceptar el combate.`);
        }
      }
    } catch (e) {
      console.error('Error comprobando cooldowns en aceptación:', e);
    }

    const [pokeJugador, pokeRival] = await Promise.all([
      consultarPokemon(desafio.pokemonRetador.pokemon_id),
      consultarPokemon(pokeInventarioRival.pokemon_id),
    ]);

    const imgJugador = getImagen(pokeJugador);
    const imgRival = getImagen(pokeRival);

    const multNivel1 = 1 + (desafio.pokemonRetador.nivel - 1) * 0.05;
    const multNivel2 = 1 + (pokeInventarioRival.nivel - 1) * 0.05;

    // Se agrega el nivel al objeto combatiente para poder calcular la ventaja luego
    const p1 = {
      nombre: desafio.pokemonRetador.nombre,
      nivel: desafio.pokemonRetador.nivel,
      hp: Math.floor(getStat(pokeJugador, 'hp') * 2 * multNivel1),
      atk: Math.floor(getStat(pokeJugador, 'attack') * multNivel1),
      def: Math.floor(getStat(pokeJugador, 'defense') * multNivel1),
      vel: Math.floor(getStat(pokeJugador, 'speed') * multNivel1),
    };

    // Se agrega el nivel al objeto combatiente para poder calcular la ventaja luego
    const p2 = {
      nombre: pokeInventarioRival.nombre,
      nivel: pokeInventarioRival.nivel,
      hp: Math.floor(getStat(pokeRival, 'hp') * 2 * multNivel2),
      atk: Math.floor(getStat(pokeRival, 'attack') * multNivel2),
      def: Math.floor(getStat(pokeRival, 'defense') * multNivel2),
      vel: Math.floor(getStat(pokeRival, 'speed') * multNivel2),
    };

    const hpMaxP1 = p1.hp;
    const hpMaxP2 = p2.hp;

    let cronica =
      `⚔️ *¡CRÓNICA DE LA BATALLA!* ⚔️\r\n` +
      `──────────────────────\r\n\r\n` +
      `👤 *${desafio.nombreRetadorText}:* ${p1.nombre} (Lv. ${desafio.pokemonRetador.nivel}) (HP: ${p1.hp})\r\n` +
      `🎯 *${desafio.nombreRivalText}:* ${p2.nombre} (Lv. ${pokeInventarioRival.nivel}) (HP: ${p2.hp})\r\n` +
      `──────────────────────\r\n\r\n`;

    let turnoJugador = p1.vel >= p2.vel;
    cronica += `⚡ _${turnoJugador ? p1.nombre : p2.nombre} toma la iniciativa por velocidad._\r\n\r\n`;

    let rondas = 0;
    while (p1.hp > 0 && p2.hp > 0 && rondas < 8) {
      rondas++;
      cronica += `*ROUND ${rondas}* 🥊\r\n`;

      const atacante = turnoJugador ? p1 : p2;
      const defensor = turnoJugador ? p2 : p1;

      // ---------------------------------------------
      // SISTEMA DE ESQUIVE (Velocidad + Bono Nivel)
      // ---------------------------------------------
      let probEsquivarBase = defensor.vel / 20; // Fórmula base
      let diffNivel = defensor.nivel - atacante.nivel; // Diferencia de nivel
      let bonoNivel = diffNivel > 0 ? diffNivel : 0; // +1% por cada nivel superior
      
      let probTotalEsquive = probEsquivarBase + bonoNivel;
      
      const dadoEsquivar = Math.random() * 100;

      if (dadoEsquivar <= probTotalEsquive) {
        cronica += `• 💨 ¡*${atacante.nombre}* ataca, pero *${defensor.nombre}* logra esquivarlo!\r\n\r\n`;
      } else {
        // ---------------------------------------------
        // CÁLCULO DE DAÑO NORMAL (Si no esquiva)
        // ---------------------------------------------
        let danioBase = Math.floor(atacante.atk * 1.4 - defensor.def * 0.4);
        if (danioBase < 12) {
          danioBase = Math.floor(Math.random() * 8) + 12;
        }

        const esCritico = Math.random() < 0.15;
        if (esCritico) danioBase = Math.floor(danioBase * 1.5);

        defensor.hp -= danioBase;
        if (defensor.hp < 0) defensor.hp = 0;

        cronica +=
          `• 💥 *${atacante.nombre}* arremete con fuerza.\r\n` +
          `• ${esCritico ? '🎯 _¡Impacto crítico!_ ' : ''}Genera *${danioBase}* de daño a ${defensor.nombre}.\r\n` +
          `• 🩸 *${defensor.nombre}* disminuye a *${defensor.hp} HP*.\r\n\r\n`;
      }

      turnoJugador = !turnoJugador;
    }

    cronica += `──────────────────────\r\n` + `🏆 *RESULTADO FINAL:* \r\n`;

    let retadorIdBD = desafio.pokemonRetador.usuario_id; 
    let rivalIdBD = pokeInventarioRival.usuario_id;

    if (!retadorIdBD) {
      const userRetador = await usuarioService.obtenerUsuario(desafio.idRetador);
      if (userRetador) retadorIdBD = userRetador.usuario_id || userRetador.id;
    }
    if (!rivalIdBD) {
      const userRival = await usuarioService.obtenerUsuario(idRival);
      if (userRival) rivalIdBD = userRival.usuario_id || userRival.id;
    }

    if (!retadorIdBD || !rivalIdBD) {
      cronica += `\n⚠️ No se pudo otorgar experiencia: El usuario no se encuentra registrado en el sistema.`;
    } else {
      if (p1.hp <= 0 && p2.hp <= 0) {
        cronica += `💀 Caída doble simultánea. ¡Es un empate absoluto!`;
      } else if (p1.hp <= 0) {
        cronica += `👑 ¡El *${p2.nombre}* de ${desafio.nombreRivalText} se lleva la victoria! 🎒`;
        await usuarioService.sumarExperiencia(rivalIdBD, 5); 
        cronica += `\n✨ +5 EXP para ${desafio.nombreRivalText}.`;
      } else if (p2.hp <= 0) {
        cronica += `👑 ¡El *${p1.nombre}* de ${desafio.nombreRetadorText} triunfa! 🎉`;
        await usuarioService.sumarExperiencia(retadorIdBD, 5); 
        cronica += `\n✨ +5 EXP para ${desafio.nombreRetadorText}.`;
      } else {
        const pctP1 = p1.hp / hpMaxP1;
        const pctP2 = p2.hp / hpMaxP2;
        
        if (pctP1 >= pctP2) {
           cronica += `⏳ ¡*${p1.nombre}* gana por vitalidad residual!`;
           await usuarioService.sumarExperiencia(retadorIdBD, 5);
           cronica += `\n✨ +5 EXP para ${desafio.nombreRetadorText}.`;
        } else {
           cronica += `⏳ ¡*${p2.nombre}* gana por vitalidad residual!`;
           await usuarioService.sumarExperiencia(rivalIdBD, 5);
           cronica += `\n✨ +5 EXP para ${desafio.nombreRivalText}.`;
        }
      }
    }

    const labeledStickers = [
      { label: `👤 ${desafio.nombreRetadorText}: ${p1.nombre}`, url: imgJugador, stickerName: p1.nombre },
      { label: `🎯 ${desafio.nombreRivalText}: ${p2.nombre}`, url: imgRival, stickerName: p2.nombre },
    ].filter((item) => item.url);

    // Registrar que ambos Pokémon participaron en un combate (fecha + incremento de combates)
    try {
      const promesas = [];
      if (desafio.pokemonRetador && desafio.pokemonRetador.id) promesas.push(pokemonService.registrarCombate(desafio.pokemonRetador.id));
      if (pokeInventarioRival && pokeInventarioRival.id) promesas.push(pokemonService.registrarCombate(pokeInventarioRival.id));
      await Promise.all(promesas);
    } catch (e) {
      console.error('Error registrando combates en BD:', e);
    }

    await replyWithLabeledStickers(msg, cronica, labeledStickers);

  } catch (error) {
    console.error('Error procesando aceptación de pokebatle:', error);
  }
}

module.exports = { handlePokebatle, handlePokeaccept };