const pokemonService = require('../services/pokemonService');
// Importamos dependencias de Canvas y API
const { generarImagenSacrificio } = require('../services/canvasService');
const { getImagen } = require('../services/pokeapi');
const { MessageMedia } = require('whatsapp-web.js');

async function handleSacrificio(msg, texto) {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    const args = texto.trim().split(/\s+/);

    if (args.length !== 4) {
        return await msg.reply('❌ Formato incorrecto. Usa: *#sacrificio [pokemon_1] [pokemon_2] [pokemon_3]*\n👉 Ejemplo: *#sacrificio Pikachu Charmander_2 Bulbasaur*');
    }

    const nombres = [args[1], args[2], args[3]];
    const pokemones = [];

    // 1. Obtener y verificar que tiene los 3 Pokémon
    for (const nombre of nombres) {
        const p = await pokemonService.verificarYObtenerPokemon(whatsappId, nombre);
        if (!p) {
            return await msg.reply(`❌ No se encontró a *${nombre}* en tu Pokédex o escribiste mal su nombre.`);
        }
        pokemones.push(p);
    }

    // 2. Verificar que no sean el mismo Pokémon (mismos IDs internos)
    const idsUnicos = new Set(pokemones.map(p => p.id));
    if (idsUnicos.size !== 3) {
        return await msg.reply('❌ No puedes sacrificar el mismo Pokémon varias veces. Deben ser 3 Pokémon distintos.');
    }

    // 3. Verificar que no estén en el equipo titular
    const equipo = await pokemonService.obtenerEquipoPokemon(whatsappId);
    const idsEquipo = equipo.map(e => e.atrapado_id);
    for (const p of pokemones) {
        if (idsEquipo.includes(p.id)) {
            return await msg.reply(`🛡️ *¡Alto!* Tu *${p.nombre}* está en tu equipo titular. Sácalo del equipo antes de sacrificarlo.`);
        }
    }

    // 4. Verificar que no estén en expedición
    const expediciones = await pokemonService.obtenerExpediciones(whatsappId);
    const idsExpedicion = expediciones.map(e => e.pokemon_id);
    for (const p of pokemones) {
        if (idsExpedicion.includes(p.id)) {
            return await msg.reply(`🏕️ *¡Alto!* Tu *${p.nombre}* está en una expedición en este momento.`);
        }
    }

    // 5. Calcular los niveles y botellas de experiencia
    // Fórmula: Si la suma > 10, da 1 botella. Cada 5 niveles extra (16, 21, 26...), da otra.
    const sumaNiveles = pokemones.reduce((acc, p) => acc + (p.nivel || 1), 0);
    let botellasXp = 0;
    
    if (sumaNiveles > 9) {
        botellasXp = 1 + Math.floor((sumaNiveles - 10) / 5);
    }

    // 6. Ejecutar en Base de Datos
    const resultado = await pokemonService.procesarSacrificio(whatsappId, Array.from(idsUnicos), botellasXp);

    if (resultado.success) {
        // Construimos el pie de foto
        let caption = `Has entregado a: *${pokemones[0].nombre}*, *${pokemones[1].nombre}* y *${pokemones[2].nombre}*.\n`;
        caption += `Suma total de niveles: *${sumaNiveles}*\n\n`;
        caption += `🎁 *Recompensas obtenidas:*\n`;
        caption += `🥚 1x Huevo (egg)\n`;
        if (botellasXp > 0) {
            caption += `🧪 ${botellasXp}x Botella(s) de XP (pocion_xp_small)\n`;
        }
        
        await msg.reply('⏳ Dibujando el círculo de transmutación y preparando el ritual...');

        try {
            // Mapeamos los datos de los 3 Pokémon para pasarlos al generador de Canvas
            const datosCanvas = pokemones.map(p => ({
                nombre: p.nombre,
                spriteUrl: getImagen({ id: p.pokemon_id }) // Extraemos la ruta local de la imagen
            }));

            // Generamos la imagen con Canvas
            const imageBuffer = await generarImagenSacrificio(datosCanvas);
            const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'sacrificio.png');
            
            // Enviamos la imagen adjuntando el caption
            return await msg.reply(media, undefined, { caption });
        } catch (canvasErr) {
            console.error('Error generando imagen de sacrificio:', canvasErr);
            // Fallback si falla el Canvas
            return await msg.reply(`🔮 *RITUAL DE SACRIFICIO COMPLETADO* 🔮\n\n${caption}`);
        }

    } else {
        return await msg.reply('⚠️ Ocurrió un error en el ritual. Inténtalo de nuevo.');
    }
}

module.exports = { handleSacrificio };