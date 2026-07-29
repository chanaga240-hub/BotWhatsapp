const pokemonService = require('../services/pokemonService');
const usuarioService = require('../services/usuarioService');
const { consultarPokemon, getStat, getImagen, obtenerMultiplicadorLocal } = require('../services/pokeapi');
const { MessageMedia } = require('whatsapp-web.js');
const { generarImagenVersus } = require('../services/canvasService');

const pendingTagBattles = new Map();
const activeTagBattles = new Map();

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
    if (tA.necesitaCambioId) cronica += `👉 *${tA.players[tA.activeIndex].name}*, elige tu relevo usando: *#tagswitch [nombre_o_posicion]*\n`;
    if (tB.necesitaCambioId) cronica += `👉 *${tB.players[tB.activeIndex].name}*, elige tu relevo usando: *#tagswitch [nombre_o_posicion]*\n`;

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

    // Consultamos la BD para obtener el nombre real del usuario que envía el comando
    const remitenteBD = await usuarioService.obtenerUsuario(remitenteId);
    if (!remitenteBD) return await msg.reply('❌ No estás registrado.');
    const remitenteNombre = remitenteBD.nombre_whatsapp;

    // ==========================================
    // 1. INICIAR DUELO 2vs2 (CREAR EQUIPO AZUL)
    // ==========================================
    if (cmd === '#tagbattle') {
        let mentionIds = msg.mentionedIds || [];
        if (mentionIds.length === 0 && typeof msg.getMentions === 'function') {
            try {
                const mentions = await msg.getMentions();
                mentionIds = mentions.map((m) => (m.id && m.id._serialized ? m.id._serialized : '')).filter(Boolean);
            } catch (e) {}
        }

        if (mentionIds.length !== 1) {
            return await msg.reply('❌ Debes mencionar a **1 sola persona** (tu aliado).\n👉 Ej: `#tagbattle @aliado Pikachu`');
        }

        const idAliado = mentionIds[0].split('@')[0].split(':')[0];
        if (idAliado === remitenteId) return await msg.reply('❌ No puedes aliarte contigo mismo.');

        const equipoP1 = await pokemonService.obtenerEquipoPokemon(remitenteId);
        if (equipoP1.length === 0) return await msg.reply('❌ No tienes un equipo registrado.');
        
        // Búsqueda inteligente: Evitamos problemas con los nombres largos buscando en el equipo
        let pokeElegido = null;
        const posMatch = texto.trim().match(/(?:^|\s)([1-6])$/); // Revisa si hay un numero del 1 al 6 al final
        
        if (posMatch) {
            pokeElegido = equipoP1.find(p => p.jerarquia === parseInt(posMatch[1]));
        } else {
            // Busca si alguna de las palabras coincide con algún Pokémon del equipo
            for (const p of equipoP1) {
                const regex = new RegExp(`(?:^|\\s)${p.nombre}(?:$|\\s)`, 'i');
                if (regex.test(texto)) {
                    pokeElegido = p;
                    break;
                }
            }
        }

        if (!pokeElegido || pokeElegido.estado !== 'activo') {
            return await msg.reply(`❌ No tienes un Pokémon válido o activo en tu equipo que coincida con lo que escribiste.\n👉 Indica su nombre o posición (1-6). Ej: #tagbattle @aliado Pikachu`);
        }

        const checkCD = verificarDescansoEquipo(equipoP1);
        if (checkCD.necesitaDescanso) return await msg.reply(`⏳ No puedes iniciar, tu *${checkCD.pokemon}* descansa por ${checkCD.mins}m ${checkCD.segs}s.`);

        // Limpiamos cualquier sala pendiente anterior creada por este usuario
        for (const [k, v] of pendingTagBattles.entries()) {
            if (v.creatorId === remitenteId) pendingTagBattles.delete(k);
        }

        const battleId = `tag_${Date.now()}`;
        
        const aliadoBD = await usuarioService.obtenerUsuario(idAliado);
        const aliadoNombre = aliadoBD ? aliadoBD.nombre_whatsapp : 'Tu Aliado';

        pendingTagBattles.set(battleId, {
            battleId,
            creatorId: remitenteId, // Guardamos quién creó la sala
            teamA: { 
                p1: { id: remitenteId, name: remitenteNombre, ready: true, equipoBD: equipoP1, jerarquia: pokeElegido.jerarquia }, 
                p2: { id: idAliado, name: aliadoNombre, ready: false } 
            },
            teamB: null // Aún no hay rivales
        });

        return await msg.reply(`⚔️ *SALA TAG 2VS2 CREADA* ⚔️\n\n🔵 Equipo Azul: *${remitenteNombre}* y *${aliadoNombre}*.\n\n👉 *${remitenteNombre}*, ahora etiqueta a tus 2 rivales enviando:\n*#tagrivals @rival1 @rival2*`);
    }

    // ==========================================
    // 1.5. ASIGNAR RIVALES (#tagrivals)
    // ==========================================
    if (cmd === '#tagrivals') {
        let mentionIds = msg.mentionedIds || [];
        if (mentionIds.length === 0 && typeof msg.getMentions === 'function') {
            try {
                const mentions = await msg.getMentions();
                mentionIds = mentions.map((m) => (m.id && m.id._serialized ? m.id._serialized : '')).filter(Boolean);
            } catch (e) {}
        }

        if (mentionIds.length !== 2) {
            return await msg.reply('❌ Debes mencionar a exactamente **2 personas** (tus rivales).\n👉 Ej: `#tagrivals @rival1 @rival2`');
        }

        let targetBattle = null;
        for (const b of pendingTagBattles.values()) {
            if (b.creatorId === remitenteId && b.teamB === null) {
                targetBattle = b;
                break;
            }
        }

        if (!targetBattle) return await msg.reply('❌ No tienes ninguna sala esperando rivales. Primero crea tu equipo usando `#tagbattle @aliado pokemon`');

        const idR1 = mentionIds[0].split('@')[0].split(':')[0];
        const idR2 = mentionIds[1].split('@')[0].split(':')[0];

        const arrIds = [remitenteId, targetBattle.teamA.p2.id, idR1, idR2];
        if (new Set(arrIds).size !== 4) return await msg.reply('❌ Todos los participantes deben ser personas distintas (No puedes pelear contra tu aliado o contra ti mismo).');

        const r1BD = await usuarioService.obtenerUsuario(idR1);
        const r2BD = await usuarioService.obtenerUsuario(idR2);
        
        const r1Nombre = r1BD ? r1BD.nombre_whatsapp : 'Rival 1';
        const r2Nombre = r2BD ? r2BD.nombre_whatsapp : 'Rival 2';

        targetBattle.teamB = {
            p1: { id: idR1, name: r1Nombre, ready: false },
            p2: { id: idR2, name: r2Nombre, ready: false }
        };

        return await msg.reply(`⚔️ *¡RETO TAG 2VS2 ENVIADO!* ⚔️\n\n🔴 Equipo Rojo: *${r1Nombre}* y *${r2Nombre}*.\n\nPara que la batalla inicie, los otros 3 jugadores (*${targetBattle.teamA.p2.name}*, *${r1Nombre}*, *${r2Nombre}*) deben confirmar enviando:\n👉 *#tagaccept [nombre_o_posicion]*`);
    }

    // ==========================================
    // 2. ACEPTAR DUELO
    // ==========================================
    if (cmd === '#tagaccept') {
        let targetBattle = null;
        let myPath = null; 

        for (const b of pendingTagBattles.values()) {
            if (b.teamA.p2.id === remitenteId && !b.teamA.p2.ready) { targetBattle = b; myPath = 'teamA.p2'; break; }
            if (b.teamB && b.teamB.p1.id === remitenteId && !b.teamB.p1.ready) { targetBattle = b; myPath = 'teamB.p1'; break; }
            if (b.teamB && b.teamB.p2.id === remitenteId && !b.teamB.p2.ready) { targetBattle = b; myPath = 'teamB.p2'; break; }
        }

        if (!targetBattle) return await msg.reply('❌ No tienes invitaciones pendientes para batallas 2vs2 (O el creador aún no ha asignado a los rivales con #tagrivals).');

        const equipoUser = await pokemonService.obtenerEquipoPokemon(remitenteId);
        if (equipoUser.length === 0) return await msg.reply('❌ No tienes un equipo configurado.');
        
        // Búsqueda inteligente
        let pokeElegido = null;
        const posMatch = texto.trim().match(/(?:^|\s)([1-6])$/);
        
        if (posMatch) {
            pokeElegido = equipoUser.find(p => p.jerarquia === parseInt(posMatch[1]));
        } else {
            for (const p of equipoUser) {
                const regex = new RegExp(`(?:^|\\s)${p.nombre}(?:$|\\s)`, 'i');
                if (regex.test(texto)) {
                    pokeElegido = p;
                    break;
                }
            }
        }

        if (!pokeElegido || pokeElegido.estado !== 'activo') {
            return await msg.reply(`❌ No tienes un Pokémon válido o activo en tu equipo que coincida con lo que escribiste.\n👉 Indica su nombre o posición (1-6). Ej: #tagaccept Pikachu`);
        }

        const checkCD = verificarDescansoEquipo(equipoUser);
        if (checkCD.necesitaDescanso) return await msg.reply(`⏳ No puedes aceptar, tu *${checkCD.pokemon}* descansa por ${checkCD.mins}m ${checkCD.segs}s.`);

        const [bando, jugador] = myPath.split('.');
        targetBattle[bando][jugador] = { id: remitenteId, name: remitenteNombre, ready: true, equipoBD: equipoUser, jerarquia: pokeElegido.jerarquia };

        await msg.reply(`✅ *${remitenteNombre}* ha aceptado el duelo.`);

        // Si todos están listos y se han definido ambos equipos, INICIAR
        if (targetBattle.teamA.p2.ready && targetBattle.teamB && targetBattle.teamB.p1.ready && targetBattle.teamB.p2.ready) {
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
        let bActive = null, bandoObj = null, pIndex = -1;
        
        for (const b of activeTagBattles.values()) {
            if (b.teamA.necesitaCambioId === remitenteId) { bActive = b; bandoObj = b.teamA; pIndex = bandoObj.activeIndex; break; }
            if (b.teamB.necesitaCambioId === remitenteId) { bActive = b; bandoObj = b.teamB; pIndex = bandoObj.activeIndex; break; }
        }

        if (!bActive) return await msg.reply('❌ No es tu turno para enviar un Pokémon a defender.');

        const jugador = bandoObj.players[pIndex];
        
        // Búsqueda inteligente del relevo
        let pokeElegido = null;
        const posMatch = texto.trim().match(/(?:^|\s)([1-6])$/);
        
        if (posMatch) {
            pokeElegido = jugador.team.find(p => p.jerarquia === parseInt(posMatch[1]));
        } else {
            for (const p of jugador.team) {
                const regex = new RegExp(`(?:^|\\s)${p.nombre}(?:$|\\s)`, 'i');
                if (regex.test(texto)) {
                    pokeElegido = p;
                    break;
                }
            }
        }

        if (!pokeElegido) return await msg.reply(`❌ No tienes Pokémon asignado en tu equipo que coincida con lo que escribiste.`);
        if (pokeElegido.hp <= 0) return await msg.reply(`❌ Ese Pokémon está debilitado. ¡Elige otro!`);

        jugador.activeJerarquia = pokeElegido.jerarquia;
        bandoObj.necesitaCambioId = null;

        await msg.reply(`🔄 *${jugador.name}* envía a *${pokeElegido.nombre}* para cubrir la posición.`);

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