const pokemonService = require('../services/pokemonService');
const usuarioService = require('../services/usuarioService');
const { consultarPokemon, getStat, getImagen, obtenerMultiplicadorLocal } = require('../services/pokeapi');
const { MessageMedia } = require('whatsapp-web.js');
const { generarImagenVersus } = require('../services/canvasService');

const pendingTagBattles = new Map();
const activeTagBattles = new Map();

function getNombre(msg) {
    return msg._data?.notifyName || msg.pushname || 'Entrenador';
}

function verificarDescansoEquipo(equipo) {
    const cooldownMs = 5 * 60 * 1000;
    const ahora = new Date();
    for (let p of equipo) {
        if (p.estado === 'activo' && p.fecha_ultimo_combate) {
            const diff = ahora - new Date(p.fecha_ultimo_combate);
            if (diff < cooldownMs) {
                const restanteMs = cooldownMs - diff;
                return { necesitaDescanso: true, pokemon: p.nombre, mins: Math.floor(restanteMs / 60000), segs: Math.floor((restanteMs % 60000) / 1000) };
            }
        }
    }
    return { necesitaDescanso: false };
}

async function prepararEquipoBatalla(equipoBD) {
    const equipoPreparado = [];
    for (let p of equipoBD) {
        let dataApi;
        try { dataApi = await consultarPokemon(p.pokemon_id); } catch(e) { continue; }
        
        const multNivel = 1 + ((p.nivel || 1) - 1) * 0.05;
        equipoPreparado.push({
            ...p,
            hp: Math.floor(getStat(dataApi, 'hp') * 2 * multNivel),
            maxHp: Math.floor(getStat(dataApi, 'hp') * 2 * multNivel),
            atk: Math.floor(getStat(dataApi, 'attack') * multNivel),
            def: Math.floor(getStat(dataApi, 'defense') * multNivel),
            spAtk: Math.floor(getStat(dataApi, 'special-attack') * multNivel),
            spDef: Math.floor(getStat(dataApi, 'special-defense') * multNivel),
            vel: Math.floor(getStat(dataApi, 'speed')),
            tipos: dataApi.types.map(t => t.type.name),
            urlImagen: getImagen(dataApi)
        });
    }
    return equipoPreparado;
}

async function ejecutarMatchupTag(battleId, msgContext) {
    const battle = activeTagBattles.get(battleId);
    let tA = battle.teamA;
    let tB = battle.teamB;

    let pA = tA.players[tA.activeIndex];
    let pB = tB.players[tB.activeIndex];

    let pokeA = pA.team.find(p => p.jerarquia === pA.activeJerarquia);
    let pokeB = pB.team.find(p => p.jerarquia === pB.activeJerarquia);

    let cronica = `⚔️ *DUELO TAG 2VS2* ⚔️\r\n──────────────────────\r\n` +
                  `🔵 *[Eq. Azul] ${pA.name}:* ${pokeA.nombre} (HP: ${pokeA.hp}/${pokeA.maxHp})\r\n` +
                  `🔴 *[Eq. Rojo] ${pB.name}:* ${pokeB.nombre} (HP: ${pokeB.hp}/${pokeB.maxHp})\r\n──────────────────────\r\n\r\n`;

    let turnoA = pokeA.vel >= pokeB.vel;
    cronica += `⚡ _${turnoA ? pokeA.nombre : pokeB.nombre} ataca primero por velocidad._\r\n\r\n`;

    let rondas = 0;
    while (pokeA.hp > 0 && pokeB.hp > 0 && rondas < 50) {
        rondas++;
        cronica += `*ROUND ${rondas}* 🥊\r\n`;

        const atacante = turnoA ? pokeA : pokeB;
        const defensor = turnoA ? pokeB : pokeA;

        let probEsquive = (defensor.vel / 20) + (defensor.nivel > 1 ? defensor.nivel - 1 : 0);
        if (probEsquive > 30) probEsquive = 30;

        if (Math.random() * 100 <= probEsquive) {
            cronica += `• 💨 ¡*${defensor.nombre}* logra esquivar el ataque de *${atacante.nombre}*!\r\n`;
        } else {
            const tipoElegido = atacante.tipos[Math.floor(Math.random() * atacante.tipos.length)];
            let danioBase = 0;
            let esAtaqueEspecial = Math.random() < 0.30;
            
            if (esAtaqueEspecial) {
                danioBase = Math.floor(atacante.spAtk * 1.4 - defensor.spDef * 0.4);
            } else {
                danioBase = Math.floor(atacante.atk * 1.4 - defensor.def * 0.4);
            }

            if (danioBase < 12) danioBase = Math.floor(Math.random() * 8) + 12;

            let multiplicador = await obtenerMultiplicadorLocal(tipoElegido, defensor.tipos);
            if (typeof multiplicador !== 'number' || isNaN(multiplicador)) multiplicador = 1;
            
            if (multiplicador === 0) danioBase = 0;
            else danioBase = Math.floor(danioBase * multiplicador);

            let esCritico = false;
            if (danioBase > 0 && Math.random() < 0.15) {
                esCritico = true;
                danioBase = Math.floor(danioBase * 1.5);
            }

            defensor.hp -= danioBase;
            if (defensor.hp < 0) defensor.hp = 0;

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
        turnoA = !turnoA;
        cronica += '\n';
    }

    if (pokeA.hp > 0 && pokeB.hp > 0 && rondas >= 50) {
        cronica += `\n⚠️ ¡Ambos Pokémon caen exhaustos por fatiga tras 50 rondas! ⚠️\n`;
        pokeA.hp = 0; pokeB.hp = 0;
    }

    const manejarCaida = async (equipoObj, jugadorActual, indexActual) => {
        const poke = jugadorActual.team.find(p => p.jerarquia === jugadorActual.activeJerarquia);
        poke.estado = 'inactivo';
        await pokemonService.cambiarEstadoEquipo(jugadorActual.id, poke.jerarquia, 'inactivo');
        cronica += `💀 ¡El *${poke.nombre}* de ${jugadorActual.name} ha caído en combate!\n`;

        const partnerIndex = (indexActual + 1) % 2;
        const vivosPartner = equipoObj.players[partnerIndex].team.filter(p => p.hp > 0).length;
        const vivosMios = jugadorActual.team.filter(p => p.hp > 0).length;

        if (vivosPartner > 0) {
            equipoObj.necesitaCambioId = equipoObj.players[partnerIndex].id;
            equipoObj.activeIndex = partnerIndex;
            cronica += `🔄 ¡Es el turno de su compañero *${equipoObj.players[partnerIndex].name}* para defender!\n`;
        } else if (vivosMios > 0) {
            equipoObj.necesitaCambioId = jugadorActual.id;
            cronica += `🔄 El compañero no tiene Pokémon. ¡*${jugadorActual.name}* debe continuar!\n`;
        }
    };

    let aCaido = pokeA.hp <= 0;
    let bCaido = pokeB.hp <= 0;

    if (aCaido) await manejarCaida(tA, pA, tA.activeIndex);
    if (bCaido) await manejarCaida(tB, pB, tB.activeIndex);

    const vivosTotalesA = tA.players[0].team.filter(p=>p.hp>0).length + tA.players[1].team.filter(p=>p.hp>0).length;
    const vivosTotalesB = tB.players[0].team.filter(p=>p.hp>0).length + tB.players[1].team.filter(p=>p.hp>0).length;

    if (vivosTotalesA === 0 || vivosTotalesB === 0) {
        cronica += `\n🏆 *¡FIN DEL COMBATE 2VS2!* 🏆\n`;
        let ganadores = [];
        if (vivosTotalesA === 0 && vivosTotalesB === 0) {
            cronica += `¡Ambos bandos fueron aniquilados! Empate absoluto.`;
        } else if (vivosTotalesA === 0) {
            cronica += `👑 ¡El equipo Rojo (*${tB.players[0].name} y ${tB.players[1].name}*) es el CAMPEÓN!`;
            ganadores = [tB.players[0], tB.players[1]];
        } else {
            cronica += `👑 ¡El equipo Azul (*${tA.players[0].name} y ${tA.players[1].name}*) es el CAMPEÓN!`;
            ganadores = [tA.players[0], tA.players[1]];
        }

        for (const p of ganadores) {
            const u = await usuarioService.obtenerUsuario(p.id);
            if (u) {
                await usuarioService.sumarExperiencia(u.id, 20);
                cronica += `\n✨ +20 EXP para ${p.name}.`;
            }
        }

        // Registrar combates y reactivar
        for (const team of [tA, tB]) {
            for (const p of team.players) {
                for (const poke of p.team) await pokemonService.registrarCombate(poke.atrapado_id);
                await pokemonService.reactivarEquipoCompleto(p.id);
            }
        }
        
        activeTagBattles.delete(battleId);
        
        const bufferVersus = await generarImagenVersus({ nombre: pokeA.nombre, url: pokeA.urlImagen }, { nombre: pokeB.nombre, url: pokeB.urlImagen });
        const media = new MessageMedia('image/png', bufferVersus.toString('base64'), 'batalla_vs.png');

        return cronica.length > 1024 
            ? (await msgContext.reply(cronica), await msgContext.reply(media)) 
            : await msgContext.reply(media, undefined, { caption: cronica });
    }

    cronica += `\n⚠️ *LA BATALLA CONTINÚA* ⚠️\n`;
    if (tA.necesitaCambioId) cronica += `👉 *${tA.players[tA.activeIndex].name}*, elige tu relevo usando: *#tagswitch [1-6]*\n`;
    if (tB.necesitaCambioId) cronica += `👉 *${tB.players[tB.activeIndex].name}*, elige tu relevo usando: *#tagswitch [1-6]*\n`;

    const bufferVersusCont = await generarImagenVersus({ nombre: pokeA.nombre, url: pokeA.urlImagen }, { nombre: pokeB.nombre, url: pokeB.urlImagen });
    const mediaCont = new MessageMedia('image/png', bufferVersusCont.toString('base64'), 'batalla_vs.png');

    return cronica.length > 1024 
        ? (await msgContext.reply(cronica), await msgContext.reply(mediaCont))
        : await msgContext.reply(mediaCont, undefined, { caption: cronica });
}

async function handleTagBattle(msg, texto) {
    const isGroup = msg.from.endsWith('@g.us');
    if (!isGroup) return await msg.reply('❌ Los combates 2vs2 solo están disponibles en grupos.');

    const args = texto.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();
    const remitenteId = (msg.author || msg.from).split('@')[0].split(':')[0];

    // ==========================================
    // 1. INICIAR DUELO 2vs2
    // ==========================================
    if (cmd === '#tagbattle') {
        if (!msg.mentionedIds || msg.mentionedIds.length !== 3) {
            return await msg.reply('❌ Debes mencionar a 3 personas: a tu aliado y a los 2 rivales.\n👉 Ej: `#tagbattle @aliado @rival1 @rival2 1`');
        }

        const idAliado = msg.mentionedIds[0].split('@')[0].split(':')[0];
        const idRival1 = msg.mentionedIds[1].split('@')[0].split(':')[0];
        const idRival2 = msg.mentionedIds[2].split('@')[0].split(':')[0];

        const arrIds = [remitenteId, idAliado, idRival1, idRival2];
        if (new Set(arrIds).size !== 4) return await msg.reply('❌ Todos los participantes deben ser personas distintas.');

        const jerarquia = parseInt(args[args.length - 1]);
        if (isNaN(jerarquia) || jerarquia < 1 || jerarquia > 6) return await msg.reply('❌ Debes indicar con qué posición (1-6) de tu equipo vas a abrir. Ej: `#tagbattle @A @R1 @R2 1`');

        const equipoP1 = await pokemonService.obtenerEquipoPokemon(remitenteId);
        if (equipoP1.length === 0) return await msg.reply('❌ No tienes un equipo registrado.');
        
        const poke = equipoP1.find(p => p.jerarquia === jerarquia);
        if (!poke || poke.estado !== 'activo') return await msg.reply(`❌ El Pokémon en la posición ${jerarquia} no está asignado o está debilitado.`);

        const checkCD = verificarDescansoEquipo(equipoP1);
        if (checkCD.necesitaDescanso) return await msg.reply(`⏳ No puedes iniciar, tu *${checkCD.pokemon}* descansa por ${checkCD.mins}m ${checkCD.segs}s.`);

        const battleId = `tag_${Date.now()}`;
        pendingTagBattles.set(battleId, {
            battleId,
            teamA: { 
                p1: { id: remitenteId, name: getNombre(msg), ready: true, equipoBD: equipoP1, jerarquia: jerarquia }, 
                p2: { id: idAliado, ready: false } 
            },
            teamB: { 
                p1: { id: idRival1, ready: false }, 
                p2: { id: idRival2, ready: false } 
            }
        });

        return await msg.reply(`⚔️ *¡RETO TAG 2VS2 LANZADO!* ⚔️\n\n🔵 Equipo Azul: *${getNombre(msg)}* y Aliado.\n🔴 Equipo Rojo: Rivales mencionados.\n\nPara que la batalla inicie, los otros 3 jugadores deben confirmar enviando:\n👉 *#tagaccept [posicion_del_1_al_6]*`);
    }

    // ==========================================
    // 2. ACEPTAR DUELO
    // ==========================================
    if (cmd === '#tagaccept') {
        const jerarquia = parseInt(args[1]);
        if (isNaN(jerarquia) || jerarquia < 1 || jerarquia > 6) return await msg.reply('❌ Elige una posición válida del 1 al 6. Ej: `#tagaccept 1`');

        let targetBattle = null;
        let myPath = null; // 'teamA.p2', 'teamB.p1', 'teamB.p2'

        for (const b of pendingTagBattles.values()) {
            if (b.teamA.p2.id === remitenteId && !b.teamA.p2.ready) { targetBattle = b; myPath = 'teamA.p2'; break; }
            if (b.teamB.p1.id === remitenteId && !b.teamB.p1.ready) { targetBattle = b; myPath = 'teamB.p1'; break; }
            if (b.teamB.p2.id === remitenteId && !b.teamB.p2.ready) { targetBattle = b; myPath = 'teamB.p2'; break; }
        }

        if (!targetBattle) return await msg.reply('❌ No tienes invitaciones pendientes para batallas 2vs2.');

        const equipoUser = await pokemonService.obtenerEquipoPokemon(remitenteId);
        if (equipoUser.length === 0) return await msg.reply('❌ No tienes un equipo configurado.');
        const poke = equipoUser.find(p => p.jerarquia === jerarquia);
        if (!poke || poke.estado !== 'activo') return await msg.reply(`❌ El Pokémon en la posición ${jerarquia} no está asignado o está debilitado.`);

        const checkCD = verificarDescansoEquipo(equipoUser);
        if (checkCD.necesitaDescanso) return await msg.reply(`⏳ No puedes aceptar, tu *${checkCD.pokemon}* descansa por ${checkCD.mins}m ${checkCD.segs}s.`);

        const [bando, jugador] = myPath.split('.');
        targetBattle[bando][jugador] = { id: remitenteId, name: getNombre(msg), ready: true, equipoBD: equipoUser, jerarquia };

        await msg.reply(`✅ Has aceptado el duelo 2vs2 con tu posición ${jerarquia}.`);

        // Si todos están listos, INICIAR
        if (targetBattle.teamA.p2.ready && targetBattle.teamB.p1.ready && targetBattle.teamB.p2.ready) {
            await msg.reply('🔥 ¡TODOS LOS ENTRENADORES ESTÁN LISTOS! Generando la arena 2vs2...');
            pendingTagBattles.delete(targetBattle.battleId);

            activeTagBattles.set(targetBattle.battleId, {
                id: targetBattle.battleId,
                teamA: {
                    players: [
                        { id: targetBattle.teamA.p1.id, name: targetBattle.teamA.p1.name, team: await prepararEquipoBatalla(targetBattle.teamA.p1.equipoBD), activeJerarquia: targetBattle.teamA.p1.jerarquia },
                        { id: targetBattle.teamA.p2.id, name: targetBattle.teamA.p2.name, team: await prepararEquipoBatalla(targetBattle.teamA.p2.equipoBD), activeJerarquia: targetBattle.teamA.p2.jerarquia }
                    ],
                    activeIndex: 0, 
                    necesitaCambioId: null
                },
                teamB: {
                    players: [
                        { id: targetBattle.teamB.p1.id, name: targetBattle.teamB.p1.name, team: await prepararEquipoBatalla(targetBattle.teamB.p1.equipoBD), activeJerarquia: targetBattle.teamB.p1.jerarquia },
                        { id: targetBattle.teamB.p2.id, name: targetBattle.teamB.p2.name, team: await prepararEquipoBatalla(targetBattle.teamB.p2.equipoBD), activeJerarquia: targetBattle.teamB.p2.jerarquia }
                    ],
                    activeIndex: 0,
                    necesitaCambioId: null
                }
            });

            await ejecutarMatchupTag(targetBattle.battleId, msg);
        }
        return;
    }

    // ==========================================
    // 3. CAMBIO DE POKÉMON (RELEVO)
    // ==========================================
    if (cmd === '#tagswitch') {
        const jerarquia = parseInt(args[1]);
        if (isNaN(jerarquia) || jerarquia < 1 || jerarquia > 6) return await msg.reply('❌ Indica la posición válida de tu equipo (1-6). Ej: `#tagswitch 2`');

        let bActive = null, bandoObj = null, pIndex = -1;
        
        for (const b of activeTagBattles.values()) {
            if (b.teamA.necesitaCambioId === remitenteId) { bActive = b; bandoObj = b.teamA; pIndex = bandoObj.activeIndex; break; }
            if (b.teamB.necesitaCambioId === remitenteId) { bActive = b; bandoObj = b.teamB; pIndex = bandoObj.activeIndex; break; }
        }

        if (!bActive) return await msg.reply('❌ No es tu turno para enviar un Pokémon a defender.');

        const jugador = bandoObj.players[pIndex];
        const nuevoPoke = jugador.team.find(p => p.jerarquia === jerarquia);

        if (!nuevoPoke) return await msg.reply(`❌ No tienes Pokémon asignado en esa posición.`);
        if (nuevoPoke.hp <= 0) return await msg.reply(`❌ Ese Pokémon está debilitado. ¡Elige otro!`);

        jugador.activeJerarquia = nuevoPoke.jerarquia;
        bandoObj.necesitaCambioId = null;

        await msg.reply(`🔄 *${jugador.name}* envía a *${nuevoPoke.nombre}* para cubrir la posición.`);

        // Si el otro bando no está esperando relevo, retomamos el combate
        if (!bActive.teamA.necesitaCambioId && !bActive.teamB.necesitaCambioId) {
            await ejecutarMatchupTag(bActive.id, msg);
        } else {
            await msg.reply(`⏳ Esperando a que el equipo rival envíe su relevo...`);
        }
        return;
    }
}

module.exports = { handleTagBattle };