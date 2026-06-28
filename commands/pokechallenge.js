const { consultarPokemon, getStat, getImagen, obtenerMultiplicadorLocal, randomPokemonId } = require('../services/pokeapi');
const pokemonService = require('../services/pokemonService');
const db = require('../services/database');
const { replyWithLabeledStickers } = require('../services/reply');

// Mapa en memoria exclusivo para los duelos PvE
const npcDesafiosPendientes = new Map();

async function handlePokechallenge(msg, texto) {
  const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
  const nombrePokemon = texto.replace('#pokechallenge', '').trim();

  // 1. OBTENER DATOS DEL USUARIO
  const [userRows] = await db.execute('SELECT * FROM usuarios WHERE whatsapp_id = ?', [whatsappId]);
  if (userRows.length === 0) return await msg.reply('❌ No estás registrado. Usa `#pokeregister` primero.');
  const usuario = userRows[0];

  // ==========================================
  // FASE 1: GENERAR EL DESAFÍO
  // ==========================================
  if (!nombrePokemon) {
    // Verificar Cooldown en la tabla usuarios (Por ejemplo: 30 minutos)
    if (usuario.fecha_challenge) {
      const ultima = new Date(usuario.fecha_challenge);
      const ahora = new Date();
      const diff = ahora - ultima;
      const cooldownMs = 10 * 60 * 1000;

      if (diff < cooldownMs) {
        const restanteMs = cooldownMs - diff;
        const minutos = Math.floor(restanteMs / 60000);
        return await msg.reply(`⏳ Tus Pokémon necesitan descansar de tantas batallas oficiales.\nDebes esperar *${minutos} minutos* para volver a desafiar a un entrenador.`);
      }
    }

    // Buscar Entrenador Aleatorio
    const [npcRows] = await db.execute('SELECT * FROM entrenador ORDER BY RAND() LIMIT 1');
    if (npcRows.length === 0) return await msg.reply('⚠️ No hay entrenadores configurados en la base de datos.');
    const npc = npcRows[0];

    // Buscar Pokémon Aleatorio en la API
    const idAleatorio = randomPokemonId();
    let pokeDataNPC;
    try {
      pokeDataNPC = await consultarPokemon(idAleatorio);
    } catch (e) {
      return await msg.reply('⚠️ Error al obtener el Pokémon del rival desde la PokéAPI.');
    }

    // Calcular un Nivel Justo (Promedio del jugador +/- 2 niveles)
    const [misPokes] = await db.execute('SELECT AVG(nivel) as promedio FROM pokemon_atrapados WHERE usuario_id = ?', [usuario.id]);
    let nivelPromedio = misPokes[0].promedio ? Math.round(misPokes[0].promedio) : 5;
    const nivelNPC = Math.max(1, nivelPromedio + (Math.floor(Math.random() * 5) - 2));

    // Guardar el desafío temporalmente
    npcDesafiosPendientes.set(whatsappId, {
      npcNombre: npc.nombre,
      npcDialogo: npc.dialog,
      pokemonIdApi: pokeDataNPC.id,
      pokemonNombre: pokeDataNPC.name,
      pokemonNivel: nivelNPC,
      pokemonTipos: pokeDataNPC.types.map(t => t.type.name),
      pokeData: pokeDataNPC
    });

    return await msg.reply(
      `📢 *¡UN ENTRENADOR TE DESAFÍA!* 📢\n\n` +
      `👤 *${npc.nombre}* se acerca y te dice:\n` +
      `💬 _"${npc.dialog}"_\n\n` +
      `🔥 Ha elegido a *${pokeDataNPC.name}* (Nivel ${nivelNPC}).\n\n` +
      `Para aceptar el duelo, responde usando:\n` +
      `👉 *#pokechallenge [nombre_de_tu_pokemon]*`
    );
  }

  // ==========================================
  // FASE 2: RESOLVER EL COMBATE
  // ==========================================
  if (!npcDesafiosPendientes.has(whatsappId)) {
    return await msg.reply('❌ No tienes ningún desafío pendiente contra un NPC. Usa `#pokechallenge` (solo) para buscar un rival.');
  }

  const desafio = npcDesafiosPendientes.get(whatsappId);
  npcDesafiosPendientes.delete(whatsappId); // Consumir el desafío para evitar bugs

  // Verificar Pokémon del usuario
  const pokeInventario = await pokemonService.verificarYObtenerPokemon(whatsappId, nombrePokemon);
  if (!pokeInventario) {
    return await msg.reply(`❌ No tienes a ningún *${nombrePokemon}* registrado en tu Pokédex.`);
  }

  // Verificar cooldown de heridas (5 min) igual que en pokebatle
  if (pokeInventario.fecha_ultimo_combate) {
    const ultima = new Date(pokeInventario.fecha_ultimo_combate);
    if ((new Date() - ultima) < 5 * 60 * 1000) {
      return await msg.reply(`⏳ Tu *${pokeInventario.nombre}* está exhausto por un combate reciente. Espera 5 minutos.`);
    }
  }

  await msg.reply(`⏳ ¡Desafío aceptado! *${usuario.nombre_whatsapp}* envía a *${pokeInventario.nombre}* contra el *${desafio.pokemonNombre}* de *${desafio.npcNombre}*...`);

  // Construir estadísticas
  const pokeJugador = await consultarPokemon(pokeInventario.pokemon_id);
  const imgJugador = getImagen(pokeJugador);
  const imgRival = getImagen(desafio.pokeData);

  const multNivelJugador = 1 + (pokeInventario.nivel - 1) * 0.05;
  const multNivelRival = 1 + (desafio.pokemonNivel - 1) * 0.05;

  const p1 = {
    nombre: pokeInventario.nombre,
    nivel: pokeInventario.nivel,
    hp: Math.floor(getStat(pokeJugador, 'hp') * 2 * multNivelJugador),
    atk: Math.floor(getStat(pokeJugador, 'attack') * multNivelJugador),
    def: Math.floor(getStat(pokeJugador, 'defense') * multNivelJugador),
    vel: Math.floor(getStat(pokeJugador, 'speed') * multNivelJugador),
    tipos: pokeJugador.types.map(t => t.type.name)
  };

  const p2 = {
    nombre: desafio.pokemonNombre,
    nivel: desafio.pokemonNivel,
    hp: Math.floor(getStat(desafio.pokeData, 'hp') * 2 * multNivelRival),
    atk: Math.floor(getStat(desafio.pokeData, 'attack') * multNivelRival),
    def: Math.floor(getStat(desafio.pokeData, 'defense') * multNivelRival),
    vel: Math.floor(getStat(desafio.pokeData, 'speed') * multNivelRival),
    tipos: desafio.pokemonTipos
  };

  const hpMaxP1 = p1.hp;
  const hpMaxP2 = p2.hp;

  let cronica =
    `⚔️ *¡BATALLA CONTRA ENTRENADOR!* ⚔️\r\n` +
    `──────────────────────\r\n\r\n` +
    `👤 *${usuario.nombre_whatsapp}:* ${p1.nombre} (Lv. ${p1.nivel}) (HP: ${p1.hp})\r\n` +
    `🎯 *${desafio.npcNombre}:* ${p2.nombre} (Lv. ${p2.nivel}) (HP: ${p2.hp})\r\n` +
    `──────────────────────\r\n\r\n`;

  let turnoJugador = p1.vel >= p2.vel;
  cronica += `⚡ _${turnoJugador ? p1.nombre : p2.nombre} toma la iniciativa por velocidad._\r\n\r\n`;

  // === BUCLE DE COMBATE ===
  let rondas = 0;
  while (p1.hp > 0 && p2.hp > 0 && rondas < 15) {
    rondas++;
    cronica += `*ROUND ${rondas}* 🥊\r\n`;

    const atacante = turnoJugador ? p1 : p2;
    const defensor = turnoJugador ? p2 : p1;

    let probEsquivarBase = defensor.vel / 20;
    let probTotalEsquive = probEsquivarBase + (defensor.nivel > 1 ? defensor.nivel - 1 : 0);
    if (probTotalEsquive > 30) probTotalEsquive = 30;

    if (Math.random() * 100 <= probTotalEsquive) {
      cronica += `• 💨 ¡*${atacante.nombre}* ataca, pero *${defensor.nombre}* logra esquivarlo!\r\n\r\n`;
    } else {
      const tipoElegido = atacante.tipos[Math.floor(Math.random() * atacante.tipos.length)];
      let danioBase = Math.floor(atacante.atk * 1.4 - defensor.def * 0.4);
      if (danioBase < 12) danioBase = Math.floor(Math.random() * 8) + 12;

      let multiplicadorElemental = 1;
      try {
        multiplicadorElemental = await obtenerMultiplicadorLocal(tipoElegido, defensor.tipos);
        if (typeof multiplicadorElemental !== 'number' || isNaN(multiplicadorElemental)) multiplicadorElemental = 1;
      } catch (err) {}

      if (multiplicadorElemental === 0) danioBase = 0;
      else danioBase = Math.floor(danioBase * multiplicadorElemental);

      let esCritico = false;
      if (danioBase > 0 && Math.random() < 0.15) {
        esCritico = true;
        danioBase = Math.floor(danioBase * 1.5);
      }

      defensor.hp -= danioBase;
      if (defensor.hp < 0) defensor.hp = 0;

      let extraText = '';
      if (multiplicadorElemental === 0) extraText = ' ¡No tiene ningún efecto! ❌ ';
      else if (multiplicadorElemental > 1.25) extraText = ' ¡Es EXTREMADAMENTE eficaz! 🔥🔥 ';
      else if (multiplicadorElemental > 1) extraText = ' ¡Es muy eficaz! 🔥 ';
      else if (multiplicadorElemental < 0.75 && multiplicadorElemental > 0) extraText = ' ¡Apenas le hace un rasguño! 🛡️🛡️ ';
      else if (multiplicadorElemental < 1) extraText = ' No es muy eficaz... 🛡️ ';

      cronica +=
        `• 💥 *${atacante.nombre}* ataca usando tipo *${tipoElegido}*.\r\n` +
        `• ${esCritico ? '🎯 _¡Impacto crítico!_ ' : ''}${extraText}` +
        `${danioBase > 0 ? `Genera *${danioBase}* de daño a ${defensor.nombre}.` : `*${defensor.nombre}* resultó ileso.`}\r\n` +
        `• 🩸 *${defensor.nombre}* disminuye a *${defensor.hp} HP*.\r\n\r\n`;
    }
    turnoJugador = !turnoJugador;
  }

  // === RESULTADOS Y RECOMPENSAS ===
  cronica += `──────────────────────\r\n🏆 *RESULTADO FINAL:* \r\n`;

  let victoriaJugador = false;
  if (p1.hp <= 0 && p2.hp <= 0) {
    cronica += `💀 Caída doble simultánea. ¡Es un empate!`;
  } else if (p1.hp <= 0) {
    cronica += `👑 ¡El *${p2.nombre}* de ${desafio.npcNombre} se lleva la victoria! 🎒`;
  } else if (p2.hp <= 0) {
    victoriaJugador = true;
    cronica += `👑 ¡Tu *${p1.nombre}* triunfa sobre el Entrenador rival! 🎉`;
  } else {
    if (p1.hp / hpMaxP1 >= p2.hp / hpMaxP2) {
      victoriaJugador = true;
      cronica += `⏳ ¡Se acabó el tiempo! Tu *${p1.nombre}* gana por vitalidad residual.`;
    } else {
      cronica += `⏳ ¡Se acabó el tiempo! *${desafio.npcNombre}* gana por vitalidad residual.`;
    }
  }

  // APLICAR RECOMPENSAS A LA BASE DE DATOS
  if (victoriaJugador) {
    cronica += `\n\n🎁 *RECOMPENSAS OBTENIDAS:*\n🪙 +15 Monedas\n✨ +5 EXP para Entrenador\n✨ +5 EXP para ${p1.nombre}`;
    
    // 1. Recompensa al Usuario (Monedas, EXP y Cooldown general)
    await db.execute('UPDATE usuarios SET monedas = monedas + 15, experiencia = experiencia + 5, fecha_challenge = NOW() WHERE id = ?', [usuario.id]);

    // 2. Recompensa al Pokémon (Con cálculo de subida de nivel por si acaso)
    let expActual = (pokeInventario.experiencia || 0) + 5;
    let nivelNuevo = pokeInventario.nivel || 1;
    let xpNecesaria = 100 + ((nivelNuevo - 1) * 25);

    if (expActual >= xpNecesaria) {
      nivelNuevo++;
      expActual = expActual - xpNecesaria;
      cronica += `\n🆙 ¡Oh! ¡Tu *${p1.nombre}* ha subido al Nivel ${nivelNuevo}!`;
    }

    await db.execute('UPDATE pokemon_atrapados SET experiencia = ?, nivel = ?, fecha_ultimo_combate = NOW() WHERE id = ?', [expActual, nivelNuevo, pokeInventario.id]);

  } else {
    // Si pierde, solo actualizamos los cooldowns
    await db.execute('UPDATE usuarios SET fecha_challenge = NOW() WHERE id = ?', [usuario.id]);
    await db.execute('UPDATE pokemon_atrapados SET fecha_ultimo_combate = NOW() WHERE id = ?', [pokeInventario.id]);
  }

  // Enviar los stickers finales
  const labeledStickers = [
    { label: `👤 ${usuario.nombre_whatsapp}: ${p1.nombre}`, url: imgJugador, stickerName: p1.nombre },
    { label: `🎯 ${desafio.npcNombre}: ${p2.nombre}`, url: imgRival, stickerName: p2.nombre },
  ].filter(item => item.url);

  await replyWithLabeledStickers(msg, cronica, labeledStickers);
}

module.exports = { handlePokechallenge };