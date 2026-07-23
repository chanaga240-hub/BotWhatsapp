const { Poll, MessageMedia } = require('whatsapp-web.js');
const configuracionService = require('../services/configuracionService');
const { consultarPokemon, getImagen, randomPokemonId } = require('../services/pokeapi');
const { generarSilueta } = require('../services/canvasService');
const usuarioService = require('../services/usuarioService');
const fs = require('fs');

const triviasActivas = new Map();

async function handleTrivia(msg, client) {
  try {
    const groupId = msg.from;

    if (triviasActivas.has(groupId)) {
        return await msg.reply('⚠️ Ya hay una trivia en curso en este grupo.');
    }
    
    // 1. Validar el cooldown
    const config = await configuracionService.obtenerConfiguracion('trivia');
    if (config) {
        const minutosRequeridos = parseInt(config.valor) || 60;
        const ultimaFecha = new Date(config.registro);
        const fechaActual = new Date();

        const diferenciaMs = fechaActual - ultimaFecha;
        const diferenciaMinutos = Math.floor(diferenciaMs / (1000 * 60));

        if (diferenciaMinutos < minutosRequeridos) {
            const minutosRestantes = minutosRequeridos - diferenciaMinutos;
            return await msg.reply(`⏳ *¡La trivia está en recarga!*\n\nDeben pasar **${minutosRequeridos} minutos** entre trivias.\nFaltan *${minutosRestantes} minuto(s)* para la próxima.`);
        }
    }

    triviasActivas.set(groupId, true);

    // 2. Iniciar la convocatoria
    const participantes = new Set();
    const pollConvocatoria = new Poll('🧠 *¡MINI-TRIVIA POKÉMON!*\n\n¿Quieres participar en la trivia de tipo = silueta?\nSe te enviarán las preguntas al privado.', ['Sí', 'No']);
    
    const msgConvocatoria = await client.sendMessage(groupId, pollConvocatoria);

    const voteListener = async (vote) => {
        try {
            // Extraer el ID de forma segura según la versión de whatsapp-web.js
            const msgId = vote.msgId || (vote.parentMessage && vote.parentMessage.id ? vote.parentMessage.id._serialized : null);
            
            if (msgId === msgConvocatoria.id._serialized) {
                const userWid = vote.voter || vote.sender; // Extraer usuario de forma segura
                
                const opciones = vote.selectedOptions || [];
                // Normalizamos las opciones a minúsculas
                const opcionesVotadas = opciones.map(opt => (opt.name || opt.localName || '').toLowerCase());
                
                // Hacemos el match tolerante a tildes y mayúsculas
                if (opcionesVotadas.includes('sí') || opcionesVotadas.includes('si')) {
                    participantes.add(userWid);
                } else {
                    participantes.delete(userWid);
                }
            }
        } catch (err) {
            console.error("Error validando voto en convocatoria:", err);
        }
    };
    client.on('vote_update', voteListener);

    await client.sendMessage(groupId, '⏳ Tienen *30 segundos* para votar "Sí" y entrar a la trivia.');
    
    await new Promise(resolve => setTimeout(resolve, 30000));
    client.off('vote_update', voteListener); 

    // Validación de cantidad mínima de participantes
    if (participantes.size < 3) {
        triviasActivas.delete(groupId);
        return await client.sendMessage(groupId, `😔 No hubo suficientes participantes para iniciar la trivia (mínimo 3).\n\nSolo *${participantes.size} entrenador(es)* votaron "Sí". Operación cancelada.`);
    }

    await configuracionService.actualizarUltimoEnvio('trivia');
    
    await client.sendMessage(groupId, `✅ ¡Inscripciones cerradas! *${participantes.size}* entrenador(es) participarán.\nRevisen sus mensajes privados, la trivia comienza YA.`);

    // 3. Preparar el registro de puntajes
    const puntajes = {};
    for (const p of participantes) {
        puntajes[p] = { correctas: 0, respondido: false, nombre: '', respuestaActual: null };
        try {
            const contact = await client.getContactById(p);
            puntajes[p].nombre = contact.pushname || contact.name || p.split('@')[0];
        } catch (errContact) {
            puntajes[p].nombre = p.split('@')[0];
        }
    }

    // 4. Iniciar las 5 Rondas
    for (let ronda = 1; ronda <= 5; ronda++) {
        const idCorrecto = randomPokemonId();
        const opcionesIds = [idCorrecto, randomPokemonId(), randomPokemonId(), randomPokemonId()];
        
        opcionesIds.sort(() => Math.random() - 0.5);

        const nombresOpciones = [];
        let pokeCorrectoDatos = null;

        for (const id of opcionesIds) {
            const data = await consultarPokemon(id);
            nombresOpciones.push(data.name.toUpperCase());
            if (id === idCorrecto) pokeCorrectoDatos = data;
        }

        let urlImagen = getImagen(pokeCorrectoDatos);
        let siluetaBuffer = null;

        if (urlImagen && fs.existsSync(urlImagen)) {
             siluetaBuffer = await generarSilueta(urlImagen);
        } else {
             console.log(`⚠️ La imagen local no existe en: ${urlImagen}. Saltando ronda.`);
        }

        if (!siluetaBuffer) {
            console.log(`⚠️ Falló la generación de imagen para ${pokeCorrectoDatos.name}. Reintentando ronda ${ronda}...`);
            ronda--; 
            continue; 
        }

        const media = new MessageMedia('image/png', siluetaBuffer.toString('base64'), 'silueta.png');
        const pollPregunta = new Poll(`Ronda ${ronda}/5: ¿Quién es este Pokémon?`, nombresOpciones);
        const mensajesRonda = new Map();
        
        for (const p of participantes) {
            puntajes[p].respondido = false; 
            puntajes[p].respuestaActual = null; 
            try {
                await client.sendMessage(p, media, { caption: '¡Mira la silueta y responde la encuesta abajo!' });
                const m = await client.sendMessage(p, pollPregunta);
                mensajesRonda.set(m.id._serialized, p);
            } catch (err) {
                console.error(`Error enviando trivia a ${p}:`, err);
            }
        }

        const answerListener = async (vote) => {
            try {
                // Aplicamos la misma lectura segura del ID para el voto
                const msgId = vote.msgId || (vote.parentMessage && vote.parentMessage.id ? vote.parentMessage.id._serialized : null);
                if (!msgId) return;
                
                if (mensajesRonda.has(msgId)) {
                    const participanteWid = mensajesRonda.get(msgId);
                    const opciones = vote.selectedOptions || [];
                    const respuesta = opciones.length > 0 ? (opciones[0].name || opciones[0].localName) : null;
                    
                    if (!puntajes[participanteWid].respondido && respuesta) {
                        puntajes[participanteWid].respondido = true;
                        puntajes[participanteWid].respuestaActual = respuesta;
                        
                        // Comparamos sin importar mayúsculas
                        if (respuesta.toUpperCase() === pokeCorrectoDatos.name.toUpperCase()) {
                            puntajes[participanteWid].correctas += 1;
                        }
                    }
                }
            } catch (err) {
                console.error("Error validando respuesta en ronda:", err);
            }
        };

        client.on('vote_update', answerListener);
        await new Promise(resolve => setTimeout(resolve, 30000));
        client.off('vote_update', answerListener);

        const respuestaCorrecta = pokeCorrectoDatos.name.toUpperCase();
        
        for (const p of participantes) {
            try {
                const respuestaUsuario = puntajes[p].respuestaActual || "No respondiste";
                const icono = (respuestaUsuario.toUpperCase() === respuestaCorrecta) ? '✅' : '❌';
                
                const mensajeFeedback = `⏳ ¡Tiempo agotado!\n\n👉 Tu respuesta: *${respuestaUsuario}*\n✔️ Respuesta correcta: *${respuestaCorrecta}*\n\nResultado: ${icono}`;
                
                await client.sendMessage(p, mensajeFeedback);
            } catch (e) {}
        }
    } 

    // 5. Finalizar y calcular
    triviasActivas.delete(groupId); 

    for (const p in puntajes) {
        const jugador = puntajes[p];
        const monedasGanadas = jugador.correctas * 5;
        const whatsappId = p.split('@')[0];
        
        try {
            if (jugador.correctas > 0) {
                const usuario = await usuarioService.obtenerUsuario(whatsappId);
                if (usuario) {
                    await usuarioService.sumarMonedas(usuario.id, monedasGanadas);
                }
            }
            
            let msjPrivado = `🏁 *¡La trivia ha terminado!*\n\nAcertaste *${jugador.correctas}/5* preguntas.`;
            if (monedasGanadas > 0) {
                msjPrivado += `\nHas ganado *+${monedasGanadas} 🪙 monedas*.`;
            }
            await client.sendMessage(p, msjPrivado);

        } catch (error) {
            console.error(`Error al procesar recompensas o DMs para ${whatsappId}:`, error);
        }
    }

    const arrayPuntajes = Object.values(puntajes).sort((a, b) => b.correctas - a.correctas);

    let mensajeFinal = `🏆 *RESULTADOS DE LA TRIVIA* 🏆\n\n`;
    const medallas = ['🥇', '🥈', '🥉'];
    let huboGanadores = false;
    
    arrayPuntajes.forEach((jugador, index) => {
        const posicion = index < 3 ? medallas[index] : `🏅 #${index + 1}`;
        const monedasGanadas = jugador.correctas * 5;
        
        if (jugador.correctas > 0) {
            mensajeFinal += `${posicion} *${jugador.nombre}* - ${jugador.correctas}/5 correctas (+${monedasGanadas} 🪙)\n`;
            huboGanadores = true;
        } else {
            mensajeFinal += `${posicion} *${jugador.nombre}* - 0/5 correctas\n`;
        }
    });

    if (!huboGanadores) {
        mensajeFinal += `\n😅 ¡Nadie acertó ninguna pregunta esta vez! Mejor suerte para la próxima.`;
    }

    await client.sendMessage(groupId, mensajeFinal);

  } catch (error) {
    triviasActivas.delete(msg.from); 
    console.error("[Trivia] Error fatal:", error.stack);
    await msg.reply("⚠️ Ocurrió un error inesperado al intentar iniciar la trivia.");
  }
}

module.exports = { handleTrivia };