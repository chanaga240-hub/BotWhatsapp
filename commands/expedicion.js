const pokemonService = require('../services/pokemonService');

async function handleExpedicion(msg, texto) {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    const args = texto.trim().split(/\s+/);

    // ==========================================
    // 1. REVISAR Y RECLAMAR EXPEDICIONES (#expedicion)
    // ==========================================
    if (args.length === 1 && args[0].toLowerCase() === '#expedicion') {
        const expediciones = await pokemonService.obtenerExpediciones(whatsappId);
        
        if (expediciones.length === 0) {
            return await msg.reply('🏕️ *CAMPAMENTO BASE*\n\nNo tienes ningún Pokémon en expedición en este momento.\n👉 Usa: *#expedicion [pokemon] [1, 2 o 3]* para enviarlos.');
        }

        let mensaje = '🏕️ *TUS EXPEDICIONES ACTUALES* 🏕️\n\n';
        const ahora = new Date();
        let algoReclamado = false;

        for (const exp of expediciones) {
            const fechaInicio = new Date(exp.fecha_inicio);
            const duracionMs = exp.duracion_dias * 24 * 60 * 60 * 1000;
            const tiempoTranscurrido = ahora - fechaInicio;

            if (tiempoTranscurrido >= duracionMs) {
                // Ya terminó la expedición, la reclamamos
                const resultado = await pokemonService.reclamarExpedicion(exp);
                if (resultado.success) {
                    const xpGanada = 50 * exp.duracion_dias; // Calculamos la XP real para el mensaje
                    mensaje += `✅ *${exp.nombre}* ha regresado victorioso.\n`;
                    mensaje += `💰 Encontró *${resultado.monedas} monedas* y ganó *${xpGanada} XP*.\n`;
                    if (resultado.subioNivel) {
                        mensaje += `🌟 ¡*${exp.nombre}* ha subido al Nivel ${resultado.nuevoNivel}!\n`;
                    }
                    mensaje += `──────────────────────\n`;
                    algoReclamado = true;
                }
            } else {
                // Aún en progreso
                const restanteMs = duracionMs - tiempoTranscurrido;
                const horas = Math.floor(restanteMs / (1000 * 60 * 60));
                const minutos = Math.floor((restanteMs % (1000 * 60 * 60)) / (1000 * 60));
                
                mensaje += `⏳ *${exp.nombre}* (Viaje de ${exp.duracion_dias} día/s)\n`;
                mensaje += `Faltan: ${horas}h y ${minutos}m para regresar.\n`;
                mensaje += `──────────────────────\n`;
            }
        }

        if (algoReclamado) {
            mensaje += '\n¡Tus fondos y Pokémon han sido actualizados en la base de datos! 🎒';
        }

        return await msg.reply(mensaje);
    }

    // ==========================================
    // 2. ENVIAR A EXPEDICIÓN (#expedicion Pikachu 2)
    // ==========================================
    if (args.length >= 3 && args[0].toLowerCase() === '#expedicion') {
        const diasStr = args[args.length - 1];
        const dias = parseInt(diasStr);
        
        // Validación de días
        if (isNaN(dias) || dias < 1 || dias > 3) {
            return await msg.reply('❌ Debes especificar un límite de *1, 2 o 3 días*.\n👉 Ejemplo: *#expedicion Pikachu 2*');
        }

        // Unimos el nombre del Pokémon (todo lo que está entre el comando y los días)
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