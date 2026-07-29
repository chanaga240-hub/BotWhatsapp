const minaService = require('../services/minaService');
const usuarioService = require('../services/usuarioService');
const { generarImagenMinas } = require('../services/canvasService');
const { MessageMedia } = require('whatsapp-web.js');

async function handleMina(msg, texto) {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    const args = texto.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    const usuario = await usuarioService.obtenerUsuario(whatsappId);
    if (!usuario) return await msg.reply('❌ No estás registrado.');

    // ==========================================
    // 1. VER MINA (Muestra el Canvas)
    // ==========================================
    if (args.length === 1 && cmd === '#mina') {
        const minas = await minaService.obtenerMinas(usuario.id);
        await msg.reply('⛏️ *Descendiendo a las profundidades de la mina...*');

        try {
            const imageBuffer = await generarImagenMinas(minas, usuario.nombre_whatsapp);
            const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'mina.png');
            
            const caption = `⛰️ *CANTERA POKÉMON* ⛰️\n\n` +
                            `Comandos disponibles:\n` +
                            `🥊 *#mina picar [1-6] [pokemon]* (Req: Tipo Lucha)\n` +
                            `🪨 *#mina extraer [1-6] [pokemon]* (Req: Tipo Roca)\n` +
                            `⚙️ *#mina refinar [1-6] [pokemon]* (Req: Tipo Acero - Requiere 5 turnos)`;

            return await msg.reply(media, undefined, { caption });
        } catch (error) {
            console.error('Error generando mina:', error);
            return await msg.reply('⚠️ Hubo un problema al iluminar la cueva.');
        }
    }

    // ==========================================
    // 2. PICAR / EXTRAER / REFINAR
    // ==========================================
    if (args.length >= 4 && ['picar', 'extraer', 'refinar'].includes(args[1].toLowerCase())) {
        const accion = args[1].toLowerCase();
        const slot = parseInt(args[2]);
        const nombrePokemon = args.slice(3).join(' ');

        if (isNaN(slot) || slot < 1 || slot > 6) return await msg.reply('❌ Indica un túnel válido del 1 al 6. Ej: #mina picar 1 Machop');

        const res = await minaService.procesarAccionMina(whatsappId, slot, nombrePokemon, accion);

        if (res.error) {
            if (res.error === 'pokemon_no_encontrado') return await msg.reply(`❌ No tienes ningún *${nombrePokemon}* registrado.`);
            if (res.error === 'cooldown_pokemon') return await msg.reply(`💤 *${nombrePokemon}* está exhausto por el trabajo pesado en la mina. Déjalo descansar *${res.horas}h ${res.mins}m* más.`);
            if (res.error === 'tipos_multiples') return await msg.reply(`❌ La minería es un arte de concentración. *${nombrePokemon}* tiene múltiples tipos y se distrae. ¡Solo se admiten Pokémon de tipo PURO!`);
            if (res.error === 'tipo_incorrecto') {
                const reqMap = { 'picar': 'Lucha (Fighting)', 'extraer': 'Roca (Rock)', 'refinar': 'Acero (Steel)' };
                return await msg.reply(`❌ Tipo incorrecto. Para *${accion}* necesitas un Pokémon de tipo puro *${reqMap[accion]}*.`);
            }
            if (res.error === 'estado_incorrecto') return await msg.reply(`❌ El túnel ${slot} no está en la fase correcta para *${accion}*. Revisa la mina con #mina.`);
            if (res.error === 'espera_fase') return await msg.reply(`⏳ Aún no han pasado las 5 horas requeridas para avanzar a esta fase.`);
            
            return await msg.reply('⚠️ Error procesando la acción minera.');
        }

        if (res.success) {
            if (accion === 'picar') return await msg.reply(`🥊 *${res.pokemon}* ha roto las rocas del Túnel ${slot}. ¡Los gases tóxicos deben disiparse! Podrás extraer el mineral en *5 horas*.`);
            if (accion === 'extraer') return await msg.reply(`🪨 *${res.pokemon}* ha extraído el mineral crudo del Túnel ${slot} con cuidado. Se debe enfriar durante *5 horas* antes de refinarlo.`);
            if (accion === 'refinar') {
                if (res.recompensa > 0) {
                    return await msg.reply(`🎉 ¡Proceso finalizado!\n\n⚙️ *${res.pokemon}* dio el último toque en la forja. Has obtenido *${res.recompensa}x Herramientas* 🛠️ y el Túnel ${slot} está libre de nuevo.`);
                } else {
                    return await msg.reply(`⚙️ *${res.pokemon}* ha trabajado duro refinando el mineral del Túnel ${slot}.\nProgreso de forja: *(${res.refinadosTotales}/5)*. ¡Falta menos!`);
                }
            }
        }
    }
}

module.exports = { handleMina };