const pokemonService = require('../services/pokemonService');
const { consultarPokemon, getStat, getImagen, getTiposEspanol } = require('../services/pokeapi');
// Importamos la nueva función generarImagenPoketeam
const { generarImagenPoketeam } = require('../services/canvasService');
const { MessageMedia } = require('whatsapp-web.js');

async function handlePoketeam(msg, texto) {
    const isGroup = msg.from.endsWith('@g.us');
    const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
    const args = texto.trim().split(/\s+/);

    // ==========================================
    // 1. CONSULTAR EQUIPO (#poketeam)
    // ==========================================
    if (args.length === 1 && args[0].toLowerCase() === '#poketeam') {
        const equipo = await pokemonService.obtenerEquipoPokemon(whatsappId);
        
        let hayPokemon = false;
        
        // Creamos un array fijo de 6 posiciones inicializado en null
        const equipoPreparado = [null, null, null, null, null, null];

        // Preparamos los datos del canvas
        for (let i = 1; i <= 6; i++) {
            const miembro = equipo.find(m => m.jerarquia === i);
            if (miembro) {
                hayPokemon = true;
                
                // Preparar datos estadísticos para el canvas en su slot correcto (i - 1)
                try {
                    let idApi = (miembro.pokemon_id && miembro.pokemon_id < 1500) ? miembro.pokemon_id : miembro.nombre.toLowerCase().trim();
                    const dataApi = await consultarPokemon(idApi);
                    
                    const multNivel = 1 + ((miembro.nivel || 1) - 1) * 0.05;
                    
                    equipoPreparado[i - 1] = {
                        nombre: miembro.nombre,
                        nivel: miembro.nivel || 1,
                        experiencia: miembro.experiencia || 0,
                        tipos: getTiposEspanol(dataApi), 
                        hp: Math.floor((getStat(dataApi, 'hp') || 0) * 2 * multNivel),
                        atk: Math.floor((getStat(dataApi, 'attack') || 0) * multNivel),
                        def: Math.floor((getStat(dataApi, 'defense') || 0) * multNivel),
                        spAtk: Math.floor((getStat(dataApi, 'special-attack') || 0) * multNivel),
                        spDef: Math.floor((getStat(dataApi, 'special-defense') || 0) * multNivel),
                        vel: Math.floor((getStat(dataApi, 'speed') || 0)),
                        spriteUrl: getImagen(dataApi)
                    };
                } catch (e) {
                    console.error(`Error preparando pokemon para canvas en poketeam:`, e);
                }
            }
        }

        // Si el equipo está vacío, solo enviamos el texto de ayuda
        if (!hayPokemon) {
            return await msg.reply('🏕️ *TU EQUIPO POKÉMON* 🏕️\n\n_Tu equipo está vacío. Asígnales una posición por chat privado:_\n👉 *#poketeam join 1 [nombre]*');
        }

        // Avisamos al usuario que se está generando la imagen
        await msg.reply('⏳ Sacando una fotografía a tu equipo ordenado...');

        try {
            // Generamos la imagen con la nueva función respetando los IDs
            const imageBuffer = await generarImagenPoketeam(equipoPreparado);
            const media = new MessageMedia('image/png', imageBuffer.toString('base64'), 'poketeam_slots.png');
            
            // Enviamos la imagen con un título simple
            return await msg.reply(media, undefined, { caption: '🏕️ *TU EQUIPO POKÉMON* 🏕️' });
        } catch (err) {
            console.error('Error generando imagen de poketeam ordenado:', err);
            return await msg.reply('⚠️ _(No se pudo generar la imagen del equipo)_');
        }
    }

    // ==========================================
    // 2. ASIGNAR POKÉMON (#poketeam join X Nombre)
    // ==========================================
    if (args.length >= 2 && args[1].toLowerCase() === 'join') {
        if (isGroup) {
            return await msg.reply('❌ La gestión de tu equipo (*#poketeam join*) solo se puede realizar por *chat privado*.');
        }

        const jerarquia = parseInt(args[2]);
        if (isNaN(jerarquia) || jerarquia < 1 || jerarquia > 6) {
            return await msg.reply('❌ Debes especificar una posición válida del *1 al 6*.\n👉 Ejemplo: *#poketeam join 1 Pikachu*');
        }

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