const pokemonService = require('../services/pokemonService');
const usuarioService = require('../services/usuarioService');
const { consultarPokemon, getStat, getImagen, obtenerMultiplicadorLocal } = require('../services/pokeapi');
const { replyWithLabeledStickers } = require('../services/reply');

// Memoria de estado
const pendingTeamChallenges = new Map();
const activeTeamBattles = new Map(); 

function getNombre(msg) {
    return msg._data?.notifyName || msg.pushname || 'Entrenador';
}

// Validador de cooldown del equipo (5 minutos)
function verificarDescansoEquipo(equipo) {
    const cooldownMs = 5 * 60 * 1000;
    const ahora = new Date();
    for (let p of equipo) {
        if (p.estado === 'activo' && p.fecha_ultimo_combate) {
            const diff = ahora - new Date(p.fecha_ultimo_combate);
            if (diff < cooldownMs) {
                const restanteMs = cooldownMs - diff;
                return { 
                    necesitaDescanso: true, 
                    pokemon: p.nombre, 
                    mins: Math.floor(restanteMs / 60000), 
                    segs: Math.floor((restanteMs % 60000) / 1000) 
                };
            }
        }
    }
    return { necesitaDescanso: false };
}

// Función para descargar stats de todo el equipo desde la API
async function prepararEquipoBatalla(equipoBD) {
    const equipoPreparado = [];
    for (let p of equipoBD) {
        let dataApi;
        try { dataApi = await consultarPokemon(p.pokemon_id); } catch(e) { continue; }
        
        const multNivel = 1 + ((p.nivel || 1) - 1) * 0.05;
        // --- CAMBIO: Añadidos spAtk y spDef en la preparación del equipo ---
        equipoPreparado.push({
            ...p,
            hp: Math.floor(getStat(dataApi, 'hp') * 2 * multNivel),
            maxHp: Math.floor(getStat(dataApi, 'hp') * 2 * multNivel),
            atk: Math.floor(getStat(dataApi, 'attack') * multNivel),
            def: Math.floor(getStat(dataApi, 'defense') * multNivel),
            spAtk: Math.floor(getStat(dataApi, 'special-attack') * multNivel),
            spDef: Math.floor(getStat(dataApi, 'special-defense') * multNivel),
            vel: Math.floor(getStat(dataApi, 'speed') * multNivel),
            tipos: dataApi.types.map(t => t.type.name),
            urlImagen: getImagen(dataApi)
        });
    }
    return equipoPreparado;
}

// MOTOR PRINCIPAL DE MATCHUP (Se ejecuta cada vez que chocan dos Pokémon)
async function ejecutarMatchup(battleId, msgContext) {
    const battle = activeTeamBattles.get(battleId);
    let p1Active = battle.p1.team.find(p => p.jerarquia === battle.p1.activeJerarquia);
    let p2Active = battle.p2.team.find(p => p.jerarquia === battle.p2.activeJerarquia);

    let cronica = `⚔️ *CHOQUE DE EQUIPOS* ⚔️\r\n──────────────────────\r\n` +
                  `👤 *${battle.p1.name}:* ${p1Active.nombre} (HP: ${p1Active.hp}/${p1Active.maxHp})\r\n` +
                  `🎯 *${battle.p2.name}:* ${p2Active.nombre} (HP: ${p2Active.hp}/${p2Active.maxHp})\r\n──────────────────────\r\n\r\n`;

    // Determinar iniciativa puramente por velocidad
    let turnoP1 = p1Active.vel >= p2Active.vel;
    
    // Eliminamos la regla forceFirstStrike para que siempre ataque el más rápido
    battle.forceFirstStrike = null; 

    cronica += `⚡ _${turnoP1 ? p1Active.nombre : p2Active.nombre} ataca primero por velocidad._\r\n\r\n`;

    let rondas = 0;
    while (p1Active.hp > 0 && p2Active.hp > 0 && rondas < 15) {
        rondas++;
        cronica += `*ROUND ${rondas}* 🥊\r\n`; // Agregado el conteo de rondas

        const atacante = turnoP1 ? p1Active : p2Active;
        const defensor = turnoP1 ? p2Active : p1Active;

        let probEsquive = (defensor.vel / 20) + (defensor.nivel > 1 ? defensor.nivel - 1 : 0);
        if (probEsquive > 30) probEsquive = 30;

        if (Math.random() * 100 <= probEsquive) {
            cronica += `• 💨 ¡*${defensor.nombre}* logra esquivar el ataque de *${atacante.nombre}*!\r\n`;
        } else {
            // 1. Selección de tipo del atacante
            const tipoElegido = atacante.tipos[Math.floor(Math.random() * atacante.tipos.length)];
            
            // 2. Cálculo base con el 30% de probabilidad de ataque especial ---
            let danioBase = 0;
            let esAtaqueEspecial = Math.random() < 0.30;
            
            if (esAtaqueEspecial) {
                danioBase = Math.floor(atacante.spAtk * 1.4 - defensor.spDef * 0.4);
            } else {
                danioBase = Math.floor(atacante.atk * 1.4 - defensor.def * 0.4);
            }

            if (danioBase < 12) danioBase = Math.floor(Math.random() * 8) + 12;

            // 3. Aplicación de efectividad
            let multiplicador = await obtenerMultiplicadorLocal(tipoElegido, defensor.tipos);
            if (typeof multiplicador !== 'number' || isNaN(multiplicador)) {
                multiplicador = 1;
            }
            
            // Lógica de daño según multiplicador
            if (multiplicador === 0) {
                danioBase = 0;
            } else {
                danioBase = Math.floor(danioBase * multiplicador);
            }

            // 4. Críticos
            let esCritico = false;
            if (danioBase > 0 && Math.random() < 0.15) {
                esCritico = true;
                danioBase = Math.floor(danioBase * 1.5);
            }

            defensor.hp -= danioBase;
            if (defensor.hp < 0) defensor.hp = 0;

            // 5. Generación de texto de efectividad
            let txtEficacia = '';
            if (multiplicador === 0) txtEficacia = ' ¡No tiene ningún efecto! ❌ ';
            else if (multiplicador > 1.25) txtEficacia = ' ¡Es EXTREMADAMENTE eficaz! 🔥🔥 ';
            else if (multiplicador > 1) txtEficacia = ' ¡Es muy eficaz! 🔥 ';
            else if (multiplicador < 0.75 && multiplicador > 0) txtEficacia = ' ¡Apenas le hace un rasguño! 🛡️🛡️ ';
            else if (multiplicador < 1) txtEficacia = ' No es muy eficaz... 🛡️ ';

            const tipoGolpeText = esAtaqueEspecial ? "un ataque especial de" : "un ataque físico de";

            cronica += `• 💥 *${atacante.nombre}* lanza ${tipoGolpeText} tipo *${tipoElegido}*.\r\n` +
                       `• ${esCritico ? '🎯 _¡Impacto crítico!_ ' : ''}${txtEficacia}` +
                       `${danioBase > 0 ? `Daño: *${danioBase}*.` : `${defensor.nombre} resultó ileso.`} 🩸 *${defensor.nombre}* queda con *${defensor.hp} HP*.\r\n`;
        }
        turnoP1 = !turnoP1;
        cronica += '\n';
    }

    // RESOLUCIÓN DEL MATCHUP
    let p1Caido = p1Active.hp <= 0;
    let p2Caido = p2Active.hp <= 0;

    if (p1Caido) {
        p1Active.estado = 'inactivo';
        await pokemonService.cambiarEstadoEquipo(battle.p1.id, p1Active.jerarquia, 'inactivo');
        cronica += `💀 ¡El *${p1Active.nombre}* de ${battle.p1.name} se ha debilitado!\n`;
    }
    if (p2Caido) {
        p2Active.estado = 'inactivo';
        await pokemonService.cambiarEstadoEquipo(battle.p2.id, p2Active.jerarquia, 'inactivo');
        cronica += `💀 ¡El *${p2Active.nombre}* de ${battle.p2.name} se ha debilitado!\n`;
    }

    const vivosP1 = battle.p1.team.filter(p => p.hp > 0).length;
    const vivosP2 = battle.p2.team.filter(p => p.hp > 0).length;

    if (vivosP1 === 0 || vivosP2 === 0) {
        // ... (Tu código existente para el fin del combate se mantiene igual)
        cronica += `\n🏆 *¡FIN DEL COMBATE DE EQUIPOS!* 🏆\n`;
        let idGanador = null;
        let nombreGanador = '';
        
        if (vivosP1 === 0 && vivosP2 === 0) {
            cronica += `¡Ambos equipos fueron aniquilados! Es un empate legendario.`;
        } else if (vivosP1 === 0) {
            cronica += `👑 ¡El equipo de *${battle.p2.name}* aplastó a su rival!`;
            idGanador = battle.p2.id; nombreGanador = battle.p2.name;
        } else {
            cronica += `👑 ¡El equipo de *${battle.p1.name}* aplastó a su rival!`;
            idGanador = battle.p1.id; nombreGanador = battle.p1.name;
        }

        if (idGanador) {
            const userGanador = await usuarioService.obtenerUsuario(idGanador);
            if (userGanador) {
                await usuarioService.sumarExperiencia(userGanador.id, 10);
                cronica += `\n✨ +10 EXP para ${nombreGanador}.`;
            }
        }

        for (let p of battle.p1.team) await pokemonService.registrarCombate(p.atrapado_id);
        for (let p of battle.p2.team) await pokemonService.registrarCombate(p.atrapado_id);
        await pokemonService.reactivarEquipoCompleto(battle.p1.id);
        await pokemonService.reactivarEquipoCompleto(battle.p2.id);

        activeTeamBattles.delete(battleId);
        await replyWithLabeledStickers(msgContext, cronica, [
            { label: 'P1', url: p1Active.urlImagen, stickerName: p1Active.nombre },
            { label: 'P2', url: p2Active.urlImagen, stickerName: p2Active.nombre }
        ]);

    } else {
        if (p1Caido) battle.p1.necesitaCambio = true;
        if (p2Caido) battle.p2.necesitaCambio = true;

        cronica += `\n⚠️ *LA BATALLA CONTINÚA* ⚠️\n`;
        if (p1Caido && p2Caido) {
            cronica += `Ambos deben elegir a su siguiente Pokémon.\n👉 Usa: *#poketeambattle switch [numero o nombre]*`;
        } else if (p1Caido) {
            cronica += `*${battle.p1.name}*, elige a tu siguiente Pokémon.\n👉 Usa: *#poketeambattle switch [numero o nombre]*`;
        } else if (p2Caido) {
            cronica += `*${battle.p2.name}*, elige a tu siguiente Pokémon.\n👉 Usa: *#poketeambattle switch [numero o nombre]*`;
        }

        await replyWithLabeledStickers(msgContext, cronica, [
            { label: 'P1', url: p1Active.urlImagen, stickerName: p1Active.nombre },
            { label: 'P2', url: p2Active.urlImagen, stickerName: p2Active.nombre }
        ]);
    }
}

async function handlePoketeamBattle(msg, texto) {
    const isGroup = msg.from.endsWith('@g.us');
    if (!isGroup) return await msg.reply('❌ Las batallas de equipo solo se permiten en grupos.');

    const args = texto.trim().split(/\s+/);
    const remitenteId = (msg.author || msg.from).split('@')[0].split(':')[0];

    // ==========================================
    // 1. INICIAR DESAFÍO
    // ==========================================
    if (args.length === 3 && args[1].startsWith('@')) {
        const idRival = msg.mentionedIds[0]?.split('@')[0].split(':')[0];
        if (!idRival) return await msg.reply('❌ Debes mencionar a un rival. Ej: #poketeambattle @Marco 1');
        if (idRival === remitenteId) return await msg.reply('❌ No puedes retarte a ti mismo.');

        const jerarquia = parseInt(args[2]);
        if (isNaN(jerarquia) || jerarquia < 1 || jerarquia > 6) return await msg.reply('❌ Jerarquía inválida (1-6).');

        const equipoRetador = await pokemonService.obtenerEquipoPokemon(remitenteId);
        if (equipoRetador.length === 0) return await msg.reply('❌ No tienes un equipo registrado.');

        const pokeElegido = equipoRetador.find(p => p.jerarquia === jerarquia);
        if (!pokeElegido) return await msg.reply(`❌ No tienes asignado un Pokémon en la posición ${jerarquia}.`);
        if (pokeElegido.estado !== 'activo') return await msg.reply(`❌ Tu ${pokeElegido.nombre} está inactivo.`);

        // Validación de enfriamiento
        const checkCooldown = verificarDescansoEquipo(equipoRetador);
        if (checkCooldown.necesitaDescanso) {
            return await msg.reply(`⏳ No puedes iniciar. Un miembro de tu equipo titular (*${checkCooldown.pokemon}*) aún está descansando por ${checkCooldown.mins}m ${checkCooldown.segs}s.`);
        }

        pendingTeamChallenges.set(idRival, {
            idRetador: remitenteId,
            nombreRetador: getNombre(msg),
            jerarquiaRetador: jerarquia,
            equipoRetadorBD: equipoRetador
        });

        return await msg.reply(`⚔️ *¡DESAFÍO DE EQUIPOS LANZADO!* ⚔️\n\n👤 *${getNombre(msg)}* reta a una batalla por equipos.\n🔥 Abrirá el combate con su Posición ${jerarquia}.\n\nPara aceptar el duelo, el rival debe usar:\n👉 *#poketeambattle accept [posicion_del_1_al_6]*`);
    }

    // ==========================================
    // 2. ACEPTAR DESAFÍO
    // ==========================================
    if (args.length === 3 && args[1].toLowerCase() === 'accept') {
        const jerarquia = parseInt(args[2]);
        if (!pendingTeamChallenges.has(remitenteId)) return await msg.reply('❌ No tienes desafíos de equipo pendientes.');

        const desafio = pendingTeamChallenges.get(remitenteId);
        const equipoRival = await pokemonService.obtenerEquipoPokemon(remitenteId);
        if (equipoRival.length === 0) return await msg.reply('❌ Tu equipo está vacío. Configúralo con #poketeam join.');

        const pokeElegido = equipoRival.find(p => p.jerarquia === jerarquia);
        if (!pokeElegido) return await msg.reply(`❌ No tienes asignado un Pokémon en la posición ${jerarquia}.`);

        const checkCooldown = verificarDescansoEquipo(equipoRival);
        if (checkCooldown.necesitaDescanso) {
            return await msg.reply(`⏳ No puedes aceptar. Un miembro de tu equipo titular (*${checkCooldown.pokemon}*) aún está descansando por ${checkCooldown.mins}m ${checkCooldown.segs}s.`);
        }

        pendingTeamChallenges.delete(remitenteId);
        await msg.reply(`⏳ ¡Desafío aceptado! Preparando stats de ambos equipos...`);

        const battleId = `${desafio.idRetador}_vs_${remitenteId}`;
        const team1 = await prepararEquipoBatalla(desafio.equipoRetadorBD);
        const team2 = await prepararEquipoBatalla(equipoRival);

        activeTeamBattles.set(battleId, {
            id: battleId,
            forceFirstStrike: null,
            p1: { id: desafio.idRetador, name: desafio.nombreRetador, team: team1, activeJerarquia: desafio.jerarquiaRetador, necesitaCambio: false },
            p2: { id: remitenteId, name: getNombre(msg), team: team2, activeJerarquia: jerarquia, necesitaCambio: false }
        });

        // Lanzar primera ronda
        await ejecutarMatchup(battleId, msg);
        return;
    }

   // ==========================================
    // 3. CAMBIAR POKÉMON DURANTE BATALLA
    // ==========================================
    if (args.length >= 3 && args[1].toLowerCase() === 'switch') {
        // Unimos el resto de los argumentos por si el nombre tiene espacios
        const parametroCambio = args.slice(2).join(' ').toLowerCase(); 
        
        let battleObj = null;
        let esP1 = false;

        // Buscar en qué batalla está el usuario
        for (let [id, b] of activeTeamBattles.entries()) {
            if (b.p1.id === remitenteId) { battleObj = b; esP1 = true; break; }
            if (b.p2.id === remitenteId) { battleObj = b; break; }
        }

        if (!battleObj) return await msg.reply('❌ No estás en ninguna batalla de equipos activa.');
        
        let jugador = esP1 ? battleObj.p1 : battleObj.p2;
        let rival = esP1 ? battleObj.p2 : battleObj.p1;

        if (!jugador.necesitaCambio) return await msg.reply('⚠️ No es tu turno de cambiar. Tu Pokémon actual sigue en pie o esperas al rival.');

        const jerarquia = parseInt(parametroCambio);
        let nuevoPoke;
        
        // Verifica si escribió un número o el nombre
        if (!isNaN(jerarquia)) {
            nuevoPoke = jugador.team.find(p => p.jerarquia === jerarquia);
        } else {
            nuevoPoke = jugador.team.find(p => p.nombre.toLowerCase() === parametroCambio);
        }

        if (!nuevoPoke) return await msg.reply(`❌ No se encontró ningún Pokémon con esa posición o nombre en tu equipo.`);
        if (nuevoPoke.hp <= 0) return await msg.reply(`❌ *${nuevoPoke.nombre}* está debilitado. ¡Elige otro!`);

        // Ejecutar cambio
        jugador.activeJerarquia = nuevoPoke.jerarquia;
        jugador.necesitaCambio = false;

        await msg.reply(`🔄 *${jugador.name}* envía a *${nuevoPoke.nombre}* a la batalla.`);

        // Si el rival NO necesita cambiar, reanudamos el combate
        if (!rival.necesitaCambio) {
            await ejecutarMatchup(battleObj.id, msg);
        } else {
            await msg.reply(`⏳ Esperando a que el rival envíe su siguiente Pokémon...`);
        }
        return;
    }
}

module.exports = { handlePoketeamBattle };