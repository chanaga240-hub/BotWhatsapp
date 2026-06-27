const pokemonService = require('../services/pokemonService');

async function handlePoketeam(msg, texto) {
    const isGroup = msg.from.endsWith('@g.us');
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    const args = texto.trim().split(/\s+/);

    // ==========================================
    // 1. CONSULTAR EQUIPO (#poketeam)
    // ==========================================
    if (args.length === 1 && args[0].toLowerCase() === '#poketeam') {
        const equipo = await pokemonService.obtenerEquipoPokemon(whatsappId);
        
        let mensaje = '🏕️ *TU EQUIPO POKÉMON* 🏕️\n\n';
        let hayPokemon = false;

        // Pintamos siempre los 6 slots para que vea la estructura
        for (let i = 1; i <= 6; i++) {
            const miembro = equipo.find(m => m.jerarquia === i);
            if (miembro) {
                mensaje += `${i}. *${miembro.nombre}* (Nv. ${miembro.nivel || 1}) - _[${miembro.estado}]_\n`;
                hayPokemon = true;
            } else {
                mensaje += `${i}. [ --- Vacío --- ]\n`;
            }
        }

        if (!hayPokemon) {
            mensaje += '\n_Tu equipo está vacío. Asígnales una posición por chat privado:_\n👉 *#poketeam join 1 [nombre]*';
        }

        return await msg.reply(mensaje);
    }

    // ==========================================
    // 2. ASIGNAR POKÉMON (#poketeam join X Nombre)
    // ==========================================
    if (args.length >= 2 && args[1].toLowerCase() === 'join') {
        // Validación estricta: NO grupos
        if (isGroup) {
            return await msg.reply('❌ La gestión de tu equipo (*#poketeam join*) solo se puede realizar por *chat privado*.');
        }

        const jerarquia = parseInt(args[2]);
        if (isNaN(jerarquia) || jerarquia < 1 || jerarquia > 6) {
            return await msg.reply('❌ Debes especificar una posición válida del *1 al 6*.\n👉 Ejemplo: *#poketeam join 1 Pikachu*');
        }

        // Unir el resto de los argumentos por si el Pokémon tiene nombres compuestos (ej. Tapu Koko)
        const nombrePokemon = args.slice(3).join(' ');
        if (!nombrePokemon) {
             return await msg.reply('❌ Debes especificar el nombre del Pokémon.\n👉 Ejemplo: *#poketeam join 1 Pikachu*');
        }

        const resultado = await pokemonService.asignarEquipoPokemon(whatsappId, jerarquia, nombrePokemon);

        if (resultado.error === 'pokemon_no_encontrado') {
            return await msg.reply(`❌ No tienes ningún *${nombrePokemon}* en tu Pokédex.`);
        } else if (resultado.error === 'ya_en_esa_posicion') {
            return await msg.reply(`⚠️ *${nombrePokemon}* ya está asignado a la posición ${jerarquia} de tu equipo.`);
        } else if (resultado.error === 'db_error') {
            return await msg.reply('⚠️ Hubo un error en la base de datos al actualizar tu equipo. Inténtalo de nuevo.');
        } else if (resultado.success) {
            return await msg.reply(`✅ ¡*${resultado.pokemon}* ha sido asignado a la posición *${resultado.jerarquia}* de tu equipo exitosamente!`);
        }
    }
}

module.exports = { handlePoketeam };