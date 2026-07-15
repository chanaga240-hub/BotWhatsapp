const pokemonService = require('../services/pokemonService');

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
    
    if (sumaNiveles > 10) {
        botellasXp = 1 + Math.floor((sumaNiveles - 11) / 5);
    }

    // 6. Ejecutar en Base de Datos
    const resultado = await pokemonService.procesarSacrificio(whatsappId, Array.from(idsUnicos), botellasXp);

    if (resultado.success) {
        let mensaje = `🔮 *RITUAL DE SACRIFICIO COMPLETADO* 🔮\n\n`;
        mensaje += `Has entregado a: *${pokemones[0].nombre}*, *${pokemones[1].nombre}* y *${pokemones[2].nombre}*.\n`;
        mensaje += `Suma total de niveles: *${sumaNiveles}*\n\n`;
        mensaje += `🎁 *Recompensas obtenidas:*\n`;
        mensaje += `🥚 1x Huevo (egg)\n`;
        if (botellasXp > 0) {
            mensaje += `🧪 ${botellasXp}x Botella(s) de XP (pocion_xp_small)\n`;
        }
        return await msg.reply(mensaje);
    } else {
        return await msg.reply('⚠️ Ocurrió un error en el ritual. Inténtalo de nuevo.');
    }
}

module.exports = { handleSacrificio };