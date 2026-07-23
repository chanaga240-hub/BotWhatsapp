const { obtenerMultiplicadorLocal } = require('./pokeapi');
const mazmorraService = require('./mazmorraService'); 
const db = require('./database');
const { generarImagenVersus } = require('./canvasService');
const { MessageMedia } = require('whatsapp-web.js');

async function ejecutarMatchupPvE(whatsappId, dungeonState, equipoIA, msgContext) {
    let p1Active = dungeonState.equipoUsuario.find(p => p.jerarquia === dungeonState.jerarquiaActiva);
    let p2Active = equipoIA.find(p => p.jerarquia === dungeonState.jerarquiaIAActiva);

    // NUEVO: Mostramos el nivel de ambos combatientes para mayor inmersión
    let cronica = `⚔️ *SALA ${dungeonState.rondaActual}: COMBATE DE MAZMORRA* ⚔️\r\n──────────────────────\r\n` +
                  `👤 *${dungeonState.nombre}:* ${p1Active.nombre} (Lv. ${p1Active.nivel || 1}) (HP: ${p1Active.hp}/${p1Active.maxHp})\r\n` +
                  `🦇 *Monstruo:* ${p2Active.nombre} (Lv. ${p2Active.nivel}) (HP: ${p2Active.hp}/${p2Active.maxHp})\r\n──────────────────────\r\n\r\n`;

    let turnoJugador = p1Active.vel >= p2Active.vel;
    cronica += `⚡ _${turnoJugador ? p1Active.nombre : p2Active.nombre} ataca primero por velocidad._\r\n\r\n`;

    let rondas = 0;
    while (p1Active.hp > 0 && p2Active.hp > 0 && rondas < 50) {
        rondas++;
        cronica += `*ROUND ${rondas}* 🥊\r\n`;

        const atacante = turnoJugador ? p1Active : p2Active;
        const defensor = turnoJugador ? p2Active : p1Active;

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
        turnoJugador = !turnoJugador;
        cronica += '\n';
    }

    let p1Caido = p1Active.hp <= 0;
    let p2Caido = p2Active.hp <= 0;

    if (p1Caido) cronica += `💀 ¡Tu *${p1Active.nombre}* se ha debilitado!\n`;
    if (p2Caido) cronica += `💀 ¡El *${p2Active.nombre}* enemigo fue destruido!\n`;

    const vivosP1 = dungeonState.equipoUsuario.filter(p => p.hp > 0).length;
    const vivosP2 = equipoIA.filter(p => p.hp > 0).length;

    let mediaVs = null;
    try {
        const bufferVersus = await generarImagenVersus(
            { nombre: p1Active.nombre, url: p1Active.urlImagen },
            { nombre: p2Active.nombre, url: p2Active.urlImagen }
        );
        mediaVs = new MessageMedia('image/png', bufferVersus.toString('base64'), 'batalla_vs.png');
    } catch (err) {
        console.error("Error generando imagen VS en mazmorra:", err);
    }

    // === CASO 1: FIN DE LA SALA ===
    if (vivosP1 === 0 || vivosP2 === 0) {
        cronica += `\n──────────────────────\n`;
        
        if (vivosP1 === 0) {
            cronica += `💥 *¡TU EQUIPO FUE ANIQUILADO!* Has sido expulsado de la mazmorra.`;
            require('../commands/mazmorra').activeDungeons.delete(whatsappId);
            
            if (mediaVs) return await msgContext.reply(mediaVs, undefined, { caption: cronica });
            return await msgContext.reply(cronica);
        } else {
            // JUGADOR GANA LA SALA
            const recompensa = await mazmorraService.generarRecompensaMazmorra(whatsappId);
            cronica += `🏆 *¡SALA ${dungeonState.rondaActual} SUPERADA!*\n🎁 Encontraste: *x${recompensa.cantidad} ${recompensa.item}*.`;

            // Sumar recompensa al Botín Total
            if (!dungeonState.botin[recompensa.item]) dungeonState.botin[recompensa.item] = 0;
            dungeonState.botin[recompensa.item] += recompensa.cantidad;

            // Curación Total y Experiencia
            for (let p of dungeonState.equipoUsuario) {
                if (p.hp > 0) {
                    await db.execute('UPDATE pokemon_atrapados SET experiencia = experiencia + 5 WHERE id = ?', [p.atrapado_id]);
                }
                p.hp = p.maxHp; 
            }
            cronica += `\n✨ ¡La energía del calabozo cura a tu equipo por completo! ✨`;

            dungeonState.rondaActual++;
            dungeonState.batallaActiva = false;

            if (dungeonState.rondaActual > 5) {
                cronica += `\n\n✨ *¡HAS SUPERADO LA MAZMORRA COMPLETA!* ✨\nHas escapado con vida del laberinto.\n\n🎒 *RESUMEN DEL BOTÍN OBTENIDO:*\n`;
                
                for (const [item, cant] of Object.entries(dungeonState.botin)) {
                    cronica += `• x${cant} ${item}\n`;
                }
                
                require('../commands/mazmorra').activeDungeons.delete(whatsappId);
                
                if (mediaVs) return await msgContext.reply(mediaVs, undefined, { caption: cronica });
                return await msgContext.reply(cronica);
            } else {
                if (mediaVs) await msgContext.reply(mediaVs, undefined, { caption: cronica });
                else await msgContext.reply(cronica);

                const imgPath = mazmorraService.obtenerImagenMazmorraAleatoria();
                const textoSiguiente = `🚪 *SALA ${dungeonState.rondaActual}*\n\nAvanzas por el pasillo oscuro... Hay 3 puertas nuevas frente a ti.\n👉 Elige tu próxima puerta y tu Pokémon inicial usando:\n\`#mazmorra puerta [1, 2 o 3] [posicion_pokemon]\`\nEjemplo: \`#mazmorra puerta 2 1\``;

                try {
                    const mediaMazmorra = MessageMedia.fromFilePath(imgPath);
                    return await msgContext.reply(mediaMazmorra, undefined, { caption: textoSiguiente });
                } catch (e) {
                    return await msgContext.reply(textoSiguiente);
                }
            }
        }
    } 
    
    // === CASO 2: LA BATALLA CONTINÚA ===
    cronica += `\n⚠️ *LA BATALLA CONTINÚA* ⚠️\n`;
    
    if (p2Caido) {
        const siguientesIA = equipoIA.filter(p => p.hp > 0);
        dungeonState.jerarquiaIAActiva = siguientesIA[0].jerarquia;
        cronica += `🔄 El laberinto invoca a *${siguientesIA[0].nombre}* a la batalla.\n`;
    }

    if (p1Caido) {
        dungeonState.necesitaCambio = true;
        cronica += `👉 Tu Pokémon cayó. Envía al siguiente usando: *#mazmorra switch [numero_posicion]*`;
        
        if (mediaVs) await msgContext.reply(mediaVs, undefined, { caption: cronica });
        else await msgContext.reply(cronica);
    } else if (p2Caido && !p1Caido) {
        if (mediaVs) await msgContext.reply(mediaVs, undefined, { caption: cronica });
        else await msgContext.reply(cronica);
        
        setTimeout(() => {
            ejecutarMatchupPvE(whatsappId, dungeonState, equipoIA, msgContext);
        }, 3000);
    }
}

module.exports = { ejecutarMatchupPvE };