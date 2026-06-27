const pokemonService = require('../services/pokemonService');
const { MessageMedia } = require('whatsapp-web.js');

async function handlePokerelease(msg, texto, botManager, usuario) {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    const nombreBuscado = texto.substring('#pokerealease'.length).trim();
    
    if (!nombreBuscado) {
        return await msg.reply('❌ Indica el nombre del Pokémon que deseas liberar.\n👉 Ejemplo: #pokerealease Pikachu');
    }

    try {
        botManager.log(`[Bot] ${usuario.nombre_whatsapp} solicita liberar: ${nombreBuscado}`, 'info');
        const poke = await pokemonService.verificarYObtenerPokemon(whatsappId, nombreBuscado);
        
        if (!poke) { 
            botManager.log(`[Bot] No se encontró ${nombreBuscado} en la Pokédex de ${usuario.nombre_whatsapp}.`, 'warn'); 
            return await msg.reply(`❌ No encontré a ningún *${nombreBuscado}* en tu Pokédex.`);
        }

        // --- NUEVA VALIDACIÓN: EQUIPO POKÉMON ---
        const equipo = await pokemonService.obtenerEquipoPokemon(whatsappId);
        const enEquipo = equipo.find(p => p.nombre.toLowerCase() === poke.nombre.toLowerCase());
        if (enEquipo) {
            return await msg.reply(`🛡️ No puedes liberar a *${poke.nombre}* porque forma parte de tu equipo titular (Posición ${enEquipo.jerarquia}).`);
        }
        // ----------------------------------------

        botManager.log(`[Bot] Pokémon encontrado en BD: id=${poke.id} especie=${poke.nombre} nivel=${poke.nivel}`, 'info');

        const liberado = await pokemonService.liberarPokemon(poke.id);
        if (!liberado) { 
            botManager.log(`[Bot] No se pudo liberar el pokémon ${nombreBuscado}.`, 'error'); 
            return await msg.reply('⚠️ Hubo un error al liberar al Pokémon. Inténtalo de nuevo.');
        }

        botManager.log(`[Bot] Pokémon liberado en BD: id=${liberado.id} pokemon_id=${liberado.pokemon_id}`, 'info');

        // Requerimos las herramientas de la API (Asegúrate de que la ruta sea correcta según tus carpetas)
        const { consultarPokemon, getImagen, getTiposEspanol, getCaptureRate, calcularProbabilidadCaptura } = require('../services/pokeapi');
        
        let dataApi = null;
        let captureRate = 45;
        try { dataApi = await consultarPokemon(liberado.pokemon_id); } catch (err) { dataApi = null; }
        if (dataApi) {
            try { captureRate = await getCaptureRate(dataApi); } catch (err) { captureRate = 45; }
        }

        const nombreMostrar = liberado.nombre || (dataApi ? dataApi.name : `#${liberado.pokemon_id}`);
        const tipos = dataApi ? getTiposEspanol(dataApi) : null;
        const urlImagen = dataApi ? getImagen(dataApi) : null;
        const probabilidadExito = calcularProbabilidadCaptura(captureRate);

        global.pokemonSalvajeActivo = {
            id: liberado.pokemon_id,
            nombre: nombreMostrar,
            nivel: liberado.nivel,
            experiencia: liberado.experiencia,
            origen: 'liberado',
            dueño_anterior: usuario.nombre_whatsapp || whatsappId,
        };

        const mensaje =
            `⚠️ *¡POKÉMON LIBERADO!* ⚠️\n\n` +
            `👤 *Liberado por:* ${usuario.nombre_whatsapp}\n` +
            `👾 *Especie:* ${nombreMostrar} (Nº ${liberado.pokemon_id})\n` +
            (tipos ? `🏷️ *Tipo:* [ *${tipos}* ]\n` : '') +
            `📊 *Dificultad de captura:* ${Math.round(probabilidadExito)}%\n` +
            `🔢 *Nivel:* ${liberado.nivel || 1} · *EXP:* ${liberado.experiencia || 0}\n\n` +
            `¡Este Pokémon ha quedado salvaje en los grupos permitidos! Intenta atraparlo con:\n👉 *#capture*`;

        // Mandamos a los grupos
        for (const groupId of botManager.GRUPOS_PERMITIDOS) {
            try {
                await botManager.client.sendMessage(groupId, mensaje);
                botManager.log(`[Bot] Notificado liberado a grupo ${groupId}`, 'info');
                if (urlImagen) {
                    const media = await MessageMedia.fromUrl(urlImagen, { unsafeMime: true });
                    if (media) await botManager.client.sendMessage(groupId, media, { sendMediaAsSticker: true, stickerName: nombreMostrar });
                }
            } catch (err) {
                botManager.log(`[Sistema] Error notificando liberado en ${groupId}: ${err.message}`, 'error');
            }
        }

        botManager.log(`[Bot] ${usuario.nombre_whatsapp} liberó a ${nombreMostrar} (ID ${liberado.pokemon_id}).`, 'info');
        
        // Responder por interno si se liberó desde un chat privado
        const isGroup = msg.from.endsWith('@g.us');
        if (!isGroup) {
            await msg.reply(`✅ Has liberado a *${nombreMostrar}*. Ahora está deambulando como salvaje en los grupos.`);
        }

    } catch (err) {
        console.error('Error en #pokerealease:', err);
        return await msg.reply('⚠️ Hubo un error al procesar la liberación.');
    }
}

module.exports = { handlePokerelease };