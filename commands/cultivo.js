const cultivoService = require('../services/cultivoService');
const usuarioService = require('../services/usuarioService');
const { generarImagenCultivos } = require('../services/canvasService');
const { MessageMedia } = require('whatsapp-web.js');

async function handleCultivo(msg, texto) {
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    const args = texto.trim().split(/\s+/);
    const cmd = args[0].toLowerCase();

    // Consultamos al usuario
    const usuario = await usuarioService.obtenerUsuario(whatsappId);
    if (!usuario) return await msg.reply('❌ No estás registrado.');

    // ==========================================
    // 1. VER GRANJA (Muestra el Canvas)
    // ==========================================
    if (args.length === 1 && cmd === '#cultivo') {
        const cultivos = await cultivoService.obtenerCultivos(usuario.id);
        await msg.reply('🚜 *Caminando hacia la granja...*');

        try {
            const imageBuffer = await generarImagenCultivos(cultivos, usuario.nombre_whatsapp);
            const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'granja.png');
            
            const caption = `🌾 *GRANJA POKÉMON* 🌾\n\n` +
                            `Comandos disponibles:\n` +
                            `🚜 *#cultivo arar [1-6] [pokemon]* (Req: Tipo Tierra)\n` +
                            `🌱 *#cultivo plantar [1-6] [pokemon]* (Req: Tipo Planta + 1 Semilla)\n` +
                            `💧 *#cultivo regar [1-6] [pokemon]* (Req: Tipo Agua)\n` +
                            `🧺 *#cultivo cosechar [1-6]*`;

            return await msg.reply(media, undefined, { caption });
        } catch (error) {
            console.error('Error generando granja:', error);
            return await msg.reply('⚠️ Hubo un problema al dibujar tu granja.');
        }
    }

    // ==========================================
    // 2. COSECHAR
    // ==========================================
    if (args.length === 3 && args[1].toLowerCase() === 'cosechar') {
        const slot = parseInt(args[2]);
        if (isNaN(slot) || slot < 1 || slot > 6) return await msg.reply('❌ Indica un campo válido del 1 al 6.');

        const res = await cultivoService.cosecharCampo(whatsappId, slot);
        if (res.error === 'no_plantado') return await msg.reply('❌ Ese campo no tiene nada plantado.');
        if (res.error === 'no_listo') return await msg.reply('❌ Aún no está listo para cosechar. Revisa el tiempo con #cultivo.');
        if (res.success) return await msg.reply(`🧺 ¡Cosecha exitosa!\n\nHas recogido *${res.cantidad}x Cultivos* 🌾 y se han guardado en tu inventario.`);
    }

    // ==========================================
    // 3. ARAR / PLANTAR / REGAR
    // ==========================================
    if (args.length >= 4 && ['arar', 'plantar', 'regar'].includes(args[1].toLowerCase())) {
        const accion = args[1].toLowerCase();
        const slot = parseInt(args[2]);
        const nombrePokemon = args.slice(3).join(' ');

        if (isNaN(slot) || slot < 1 || slot > 6) return await msg.reply('❌ Indica un campo válido del 1 al 6. Ej: #cultivo arar 1 Diglett');

        const res = await cultivoService.procesarAccionCultivo(whatsappId, slot, nombrePokemon, accion);

        if (res.error) {
            if (res.error === 'pokemon_no_encontrado') return await msg.reply(`❌ No tienes ningún *${nombrePokemon}* registrado.`);
            if (res.error === 'cooldown_pokemon') return await msg.reply(`💤 *${nombrePokemon}* está exhausto. Déjalo descansar *${res.mins} minutos* más antes de volver a trabajar.`);
            if (res.error === 'tipos_multiples') return await msg.reply(`❌ Este trabajo es muy especializado. *${nombrePokemon}* tiene múltiples tipos y se confunde. ¡Solo se admiten Pokémon de tipo PURO!`);
            if (res.error === 'tipo_incorrecto') {
                const reqMap = { 'arar': 'Tierra (Ground)', 'plantar': 'Planta (Grass)', 'regar': 'Agua (Water)' };
                return await msg.reply(`❌ Tipo incorrecto. Para *${accion}* necesitas un Pokémon de tipo puro *${reqMap[accion]}*.`);
            }
            if (res.error === 'estado_incorrecto') return await msg.reply(`❌ El campo ${slot} no está en las condiciones correctas para *${accion}*.`);
            if (res.error === 'sin_semillas') return await msg.reply('🎒 No tienes *Semillas* en tu inventario para plantar.');
            if (res.error === 'cooldown_regar') return await msg.reply(`💧 La tierra aún está húmeda. Podrás volver a regar en *${res.horasFaltan} horas*.`);
            
            return await msg.reply('⚠️ Error procesando la acción.');
        }

        if (res.success) {
            if (accion === 'arar') return await msg.reply(`🚜 *${res.pokemon}* ha removido la tierra del Campo ${slot}. ¡Está listo para plantar!`);
            if (accion === 'plantar') return await msg.reply(`🌱 *${res.pokemon}* ha enterrado la semilla en el Campo ${slot}. Tomará 20 horas en crecer.`);
            if (accion === 'regar') return await msg.reply(`💧 *${res.pokemon}* ha regado el Campo ${slot}. El tiempo de crecimiento se ha reducido en 2 horas.`);
        }
    }
}

module.exports = { handleCultivo };