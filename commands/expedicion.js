const pokemonService = require('../services/pokemonService');
// Importamos el generador de la imagen y la herramienta para sacar las rutas de sprites
const { generarImagenExpediciones } = require('../services/canvasService');
const { getImagen } = require('../services/pokeapi');
const { MessageMedia } = require('whatsapp-web.js');

async function handleExpedicion(msg, texto) {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    const args = texto.trim().split(/\s+/);

    // ==========================================
    // 1. REVISAR Y RECLAMAR EXPEDICIONES (#expedicion)
    // ==========================================
    if (args.length === 1 && args[0].toLowerCase() === '#expedicion') {
        const expediciones = await pokemonService.obtenerExpediciones(whatsappId);
        
        if (expediciones.length === 0) {
            return await msg.reply('🏕️ *CAMPAMENTO BASE*\n\nNo tienes ningún Pokémon en expedición en este momento.\n👉 Usa: *#expedicion [pokemon] [1, 2 o 3]* para enviarlos.\n👉 Usa: *#expedicion undo [pokemon]* para llamarlos de vuelta.');
        }

        let mensajeRecompensas = '';
        const ahora = new Date();
        let algoReclamado = false;
        
        // Array especial que le pasaremos al Canvas
        const datosCanvas = [];

        for (const exp of expediciones) {
            const fechaInicio = new Date(exp.fecha_inicio);
            const duracionMs = exp.duracion_dias * 24 * 60 * 60 * 1000;
            const tiempoTranscurrido = ahora - fechaInicio;
            
            let completado = false;
            let progreso = tiempoTranscurrido / duracionMs;
            let textoEstado = '';

            if (tiempoTranscurrido >= duracionMs) {
                // Ya terminó la expedición, la reclamamos
                completado = true;
                progreso = 1; // 100%
                textoEstado = '¡COMPLETADA!';

                const resultado = await pokemonService.reclamarExpedicion(exp);
                if (resultado.success) {
                    const xpGanada = 50 * exp.duracion_dias; 
                    mensajeRecompensas += `✅ *${exp.nombre}* ha regresado victorioso.\n`;
                    mensajeRecompensas += `💰 Encontró *${resultado.monedas} monedas* y ganó *${xpGanada} XP*.\n`;
                    if (resultado.subioNivel) {
                        mensajeRecompensas += `🌟 ¡*${exp.nombre}* ha subido al Nivel ${resultado.nuevoNivel}!\n`;
                    }
                    mensajeRecompensas += `──────────────────────\n`;
                    algoReclamado = true;
                }
            } else {
                // Aún en progreso
                const restanteMs = duracionMs - tiempoTranscurrido;
                const horas = Math.floor(restanteMs / (1000 * 60 * 60));
                const minutos = Math.floor((restanteMs % (1000 * 60 * 60)) / (1000 * 60));
                
                textoEstado = `Faltan ${horas}h ${minutos}m`;
                
                // NOTA: Se eliminó la concatenación de texto para no repetirlo en el chat, 
                // ya que ahora se muestra exclusivamente en la imagen Canvas.
            }

            // Agregamos la info empaquetada para dibujar la tarjeta
            datosCanvas.push({
                nombre: exp.nombre,
                nivel: exp.nivel,
                spriteUrl: getImagen({ id: exp.pokedex_id }), // Usa el ID corregido de la Pokedex
                progreso: progreso,
                textoEstado: textoEstado,
                completado: completado
            });
        }

        // Construimos el pie de foto final dependiendo de si hubo recompensas
        let captionFinal = '';
        if (algoReclamado) {
            captionFinal = `🏕️ *REPORTE DE EXPEDICIONES* 🏕️\n\n${mensajeRecompensas}\n¡Tus fondos y Pokémon han sido actualizados en la base de datos! 🎒`;
        } else {
            captionFinal = `🏕️ *CAMPAMENTO BASE*\n\n👉 Usa: *#expedicion [nombre] [dias]* para enviar más.\n👉 Usa: *#expedicion undo [nombre]* para cancelar.`;
        }

        // Avisamos al usuario que se está generando la imagen
        await msg.reply('⏳ Tomando una fotografía del campamento...');

        try {
            // Generamos la imagen con el Canvas
            const imageBuffer = await generarImagenExpediciones(datosCanvas);
            const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'expedicion.png');
            
            // Enviamos la imagen adjuntando el texto limpio en el pie de foto
            return await msg.reply(media, undefined, { caption: captionFinal });
        } catch (err) {
            console.error('Error generando imagen de expediciones:', err);
            // Fallback en caso de que el canvas falle, enviamos solo el texto
            return await msg.reply(captionFinal);
        }
    }

    // ==========================================
    // 2. CANCELAR EXPEDICIÓN (#expedicion undo Pikachu)
    // ==========================================
    if (args.length >= 2 && args[1].toLowerCase() === 'undo') { 
        const nombrePokemon = args.slice(2).join(' ');

        if (!nombrePokemon) {
            return await msg.reply('❌ Debes especificar el nombre del Pokémon.\n👉 Ejemplo: *#expedicion undo Pikachu*');
        }

        const resultado = await pokemonService.cancelarExpedicion(whatsappId, nombrePokemon);

        if (resultado.error === 'pokemon_no_encontrado') {
            return await msg.reply(`❌ No tienes ningún *${nombrePokemon}* registrado en tu Pokédex.`);
        } else if (resultado.error === 'no_en_expedicion') {
            return await msg.reply(`⚠️ *${nombrePokemon}* no se encuentra en ninguna expedición en este momento.`);
        } else if (resultado.error === 'db_error') {
            return await msg.reply('⚠️ Hubo un error en el campamento base al intentar llamarlo. Inténtalo de nuevo.');
        } else if (resultado.success) {
            if (resultado.diasCompletados > 0) {
                let msj = `🛑 *EXPEDICIÓN CANCELADA*\n\nHas llamado a *${nombrePokemon}* de vuelta al campamento.\nLogró explorar durante *${resultado.diasCompletados} día(s)* completo(s) antes de que lo interrumpieras.\n\n💰 Trajo *${resultado.monedas} monedas* y ganó *${resultado.xpGanada} XP*.`;
                if (resultado.subioNivel) {
                    msj += `\n🌟 ¡Además ha subido al Nivel ${resultado.nuevoNivel}!`;
                }
                return await msg.reply(msj);
            } else {
                return await msg.reply(`🛑 *EXPEDICIÓN CANCELADA*\n\nHas llamado a *${nombrePokemon}* de vuelta al campamento.\nComo no alcanzó a estar ni siquiera 24 horas explorando, ha regresado con las manos vacías.`);
            }
        }
        return;
    }

    // ==========================================
    // 3. ENVIAR A EXPEDICIÓN (#expedicion Pikachu 2)
    // ==========================================
    if (args.length >= 3) {
        const diasStr = args[args.length - 1];
        const dias = parseInt(diasStr);
        
        // Validación de días
        if (isNaN(dias) || dias < 1 || dias > 3) {
            return await msg.reply('❌ Debes especificar un límite de *1, 2 o 3 días* al final.\n👉 Ejemplo: *#expedicion Pikachu 2*');
        }

        const nombrePokemon = args.slice(1, -1).join(' ');

        if (!nombrePokemon) {
            return await msg.reply('❌ Debes especificar el nombre del Pokémon.\n👉 Ejemplo: *#expedicion Pikachu 2*');
        }

        const resultado = await pokemonService.enviarExpedicion(whatsappId, nombrePokemon, dias);

        if (resultado.error === 'pokemon_no_encontrado') {
            return await msg.reply(`❌ No tienes ningún *${nombrePokemon}* registrado en tu Pokédex.`);
        } else if (resultado.error === 'limite_alcanzado') {
            return await msg.reply('🛑 *Límite alcanzado*\n\nYa tienes el máximo de *3 Pokémon* en expedición al mismo tiempo. Espera a que uno regrese.');
        } else if (resultado.error === 'ya_en_expedicion') {
            return await msg.reply(`⚠️ Tu *${nombrePokemon}* ya se encuentra explorando. No puedes mandarlo dos veces.`);
        
        } else if (resultado.error === 'en_equipo') {
            return await msg.reply(`🛡️ *¡Compañero ocupado!*\n\nTu *${nombrePokemon}* forma parte de tu equipo titular (Posición ${resultado.posicion}). No puedes enviarlo de expedición a menos que lo reemplaces en tu equipo con otro Pokémon.`);

        } else if (resultado.error === 'db_error') {
            return await msg.reply('⚠️ Hubo un error en el campamento base al registrar tu expedición. Inténtalo de nuevo.');
        } else if (resultado.success) {
            return await msg.reply(`🗺️ ¡*${resultado.pokemon}* ha empacado sus cosas y ha salido de expedición por *${dias} día(s)*!\n\nRegresa luego y revisa con *#expedicion* para ver qué recompensas trae.`);
        }
    }
}

module.exports = { handleExpedicion };