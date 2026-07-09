const { Poll, MessageMedia } = require('whatsapp-web.js');
const configuracionService = require('../services/configuracionService');
const { consultarPokemon, getImagen, randomPokemonId } = require('../services/pokeapi');
const { generarSilueta } = require('../services/canvasService');
const usuarioService = require('../services/usuarioService');
const fs = require('fs');

const triviasActivas = new Map();

async function handleTrivia(msg, client) {
    const chat = await msg.getChat();
    const groupId = chat.id._serialized;

    if (!chat.isGroup) {
        return await msg.reply('❌ Este comando solo puede usarse en grupos.');
    }

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
    const msgConvocatoria = await chat.sendMessage(pollConvocatoria);

    const voteListener = async (vote) => {
        if (vote.parentMessage && vote.parentMessage.id._serialized === msgConvocatoria.id._serialized) {
            const userWid = vote.voter;
            const opcionesVotadas = vote.selectedOptions.map(opt => opt.name);
            
            if (opcionesVotadas.includes('Sí')) {
                participantes.add(userWid);
            } else {
                participantes.delete(userWid);
            }
        }
    };
    client.on('vote_update', voteListener);

    await chat.sendMessage('⏳ Tienen *30 segundos* para votar "Sí" y entrar a la trivia.');
    
    await new Promise(resolve => setTimeout(resolve, 30000));
    client.off('vote_update', voteListener); 

    if (participantes.size < 3) {
        triviasActivas.delete(groupId);
        return await chat.sendMessage('😔 No hubo suficientes participantes para iniciar la trivia (mínimo 3). Operación cancelada.');
    }

    await configuracionService.actualizarUltimoEnvio('trivia');
    
    await chat.sendMessage(`✅ ¡Inscripciones cerradas! *${participantes.size}* entrenador(es) participarán.\nRevisen sus mensajes privados, la trivia comienza YA.`);

    // 3. Preparar el registro de puntajes (AGREGAMOS respuestaActual)
    const puntajes = {};
    for (const p of participantes) {
        puntajes[p] = { correctas: 0, respondido: false, nombre: '', respuestaActual: null };
        const contact = await client.getContactById(p);
        puntajes[p].nombre = contact.pushname || contact.name || p.split('@')[0];
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

        // Validamos que el archivo de imagen EXISTA realmente en tu disco duro
        if (urlImagen && fs.existsSync(urlImagen)) {
             siluetaBuffer = await generarSilueta(urlImagen);
        } else {
             console.log(`⚠️ La imagen local no existe en: ${urlImagen}. Saltando ronda.`);
        }

        // --- NUEVA VALIDACIÓN AÑADIDA ---
        // Si falló la descarga o generación de la imagen, reintentamos la ronda.
        if (!siluetaBuffer) {
            console.log(`⚠️ Falló la generación de imagen para ${pokeCorrectoDatos.name}. Reintentando ronda ${ronda}...`);
            ronda--; // Restamos 1 para que el bucle vuelva a intentar esta misma ronda
            continue; // Saltamos todo lo de abajo y volvemos al inicio del for
        }
        // -------------------------------

        const media = new MessageMedia('image/png', siluetaBuffer.toString('base64'), 'silueta.png');

        const pollPregunta = new Poll(`Ronda ${ronda}/5: ¿Quién es este Pokémon?`, nombresOpciones);

        const mensajesRonda = new Map();
        for (const p of participantes) {
            // Reiniciamos el estado de respuesta para esta nueva ronda
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
            if (!vote.parentMessage) return; 
            const msgId = vote.parentMessage.id._serialized;
            
            if (mensajesRonda.has(msgId)) {
                const participanteWid = mensajesRonda.get(msgId);
                const respuesta = vote.selectedOptions.length > 0 ? vote.selectedOptions[0].name : null;
                
                // Registramos solo el primer voto (evita que cambien a última hora y hagan trampa)
                if (!puntajes[participanteWid].respondido && respuesta) {
                    puntajes[participanteWid].respondido = true;
                    puntajes[participanteWid].respuestaActual = respuesta; // Guardamos su respuesta
                    
                    if (respuesta === pokeCorrectoDatos.name.toUpperCase()) {
                        puntajes[participanteWid].correctas += 1;
                    }
                }
            }
        };

        client.on('vote_update', answerListener);
        
        await new Promise(resolve => setTimeout(resolve, 30000));
        client.off('vote_update', answerListener);

        // AJUSTE: Mensaje de retroalimentación detallada
        const respuestaCorrecta = pokeCorrectoDatos.name.toUpperCase();
        
        for (const p of participantes) {
            try {
                const respuestaUsuario = puntajes[p].respuestaActual || "No respondiste";
                const icono = (respuestaUsuario === respuestaCorrecta) ? '✅' : '❌';
                
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

    await chat.sendMessage(mensajeFinal);
}

module.exports = { handleTrivia };