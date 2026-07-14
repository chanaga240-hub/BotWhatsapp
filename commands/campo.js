const { MessageMedia } = require('whatsapp-web.js');
const path = require('path');
const fs = require('fs');
const campoService = require('../services/campoService');
const db = require('../services/database');
const { buscarPokemonPorTipo } = require('../services/pokeapi');

const TRADUCTOR_TIPOS = { 'normal': 'Normal', 'fire': 'Fuego', 'water': 'Agua', 'Electric': 'Electrico', 'Grass':'Planta', 'Ice':'Hielo', 'Poison':'Veneno', 'Ground':'Tierra', 'Ghost':'Fantasma' };
global.campoPokemonPendiente = new Map();

async function handleCampo(msg, textoCompleto) {
    console.log(`[DEBUG] Recibido texto: "${textoCompleto}"`);
    try {
        const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
        const [userRows] = await db.execute('SELECT id FROM usuarios WHERE whatsapp_id = ?', [whatsappId]);
        
        if (userRows.length === 0) {
            return await msg.reply('❌ No estás registrado. Usa #pokeregister para comenzar.');
        }
        
        const usuario = userRows[0];
        
        // Normalización avanzada: extrae la letra y el número ignorando espacios o falta de guion
        const textoLimpio = textoCompleto.replace(/#campo/i, '').replace(/\s+/g, '');
        const matchCoordenada = textoLimpio.match(/^([A-D])[-_]?([1-7])$/i);
        
        const coordenada = matchCoordenada ? `${matchCoordenada[1].toUpperCase()}-${matchCoordenada[2]}` : null;

        // 1. Mostrar mapa si no hay coordenada válida o se solicitó solo #campo
        if (!coordenada && textoLimpio === '') {
            const { campo } = await campoService.obtenerOCrearCampoHoy();
            const tipoFormateado = TRADUCTOR_TIPOS[campo.tipo_campo] || 'Normal';
            const mapa = typeof campo.estructura === 'string' ? JSON.parse(campo.estructura) : campo.estructura;
            
            let celdasReclamadas = 0;
            let disponiblesTexto = "*Disponibles:*\n"; // Iniciamos el texto de disponibles
            
            for (const fila in mapa) {
                let columnasLibres = [];
                for (const col in mapa[fila]) {
                    if (mapa[fila][col].estado === 'reclamado') {
                        celdasReclamadas++;
                    } else {
                        // Si no está reclamado, asumimos que está 'libre' y guardamos la columna
                        columnasLibres.push(col);
                    }
                }
                
                // Si la fila tiene columnas libres, la agregamos al texto con el formato deseado
                if (columnasLibres.length > 0) {
                    disponiblesTexto += `${fila} (${columnasLibres.join(',')})\n`;
                }
            }

            const imagePath = path.join(__dirname, '..', 'assets', 'Image_Helpers', `Campo_${tipoFormateado}.jpg`);
            let media = fs.existsSync(imagePath) ? MessageMedia.fromFilePath(imagePath) : null;
            
            // Incorporamos el texto de celdas disponibles al mensaje (caption)
            const caption = `🏕️ *Campo:* ${tipoFormateado}\n🔍 *Celdas revisadas:* ${celdasReclamadas}/28\n\n${disponiblesTexto}\nUsa #campo A-1 para explorar una celda.`;

            return media ? await msg.reply(media, undefined, { caption }) : await msg.reply(caption);
        } else if (!coordenada && textoLimpio !== '') {
            return await msg.reply('⚠️ Formato inválido. Por favor usa un formato como A-1.');
        }

        // 2. Procesar exploración de celda
        const resultado = await campoService.explorarCelda(usuario.id, coordenada);

        // 3. Manejo EXPLÍCITO de TODOS los errores
        if (resultado.error) {
            const mensajesError = {
                'limite_diario': '🛑 Has alcanzado el límite de 3 revisiones hoy.',
                'ya_reclamado': '❌ Este arbusto ya fue revisado por alguien más.',
                'coordenada_invalida': '⚠️ Coordenada inválida. Usa formato A-1.',
                'no_generado': '⚠️ El campo de hoy aún no ha sido generado. Usa #campo primero.',
                'db_error': '⚙️ Hubo un problema al intentar explorar. Intenta de nuevo en unos segundos.'
            };
            return await msg.reply(mensajesError[resultado.error] || '⚠️ Error desconocido en el campo.');
        }

        // 4. Gestión de recompensas
        const { resultado: premio, tipoCampo } = resultado;

        switch(premio) {
            case 'pokeballs':
                await db.execute('UPDATE usuarios SET pokeballs = pokeballs + 5 WHERE id = ?', [usuario.id]);
                await msg.reply('🎾 ¡Encontraste 5 Pokéballs!');
                break;
            case 'monedas':
                await db.execute('UPDATE usuarios SET monedas = monedas + 50 WHERE id = ?', [usuario.id]);
                await msg.reply('💰 ¡Encontraste 50 de monedas!');
                break;
            case 'pocion_xp_small':
                await db.execute('UPDATE inventario SET pocion_xp_small = pocion_xp_small + 1 WHERE usuario_id = ?', [usuario.id]);
                await msg.reply('🧪 ¡Encontraste una Poción XP!');
                break;
            case 'pokemon':
                const poke = await buscarPokemonPorTipo(tipoCampo);
                global.campoPokemonPendiente.set(whatsappId, poke);
                
                // 1. Obtener la imagen (usando la misma lógica de pokeapi/reply)
                const { getImagen } = require('../services/pokeapi');
                const { getMediaFromUrlWithCache } = require('../services/reply'); // O tu método para obtener imagen
                
                const imageUrl = getImagen(poke);
                const media = await getMediaFromUrlWithCache(imageUrl); // Esto descarga o trae de cache la imagen

                // 2. Enviar mensaje CON la imagen
                await msg.reply(media, undefined, { 
                    caption: `✨ ¡Un *${poke.name}* salvaje apareció! Usa #campocapture para intentar atraparlo.` 
                });
                break;
            default:
                await msg.reply('🍃 El arbusto estaba vacío...');
                break;
        }

    } catch (error) {
        console.error('Error en handleCampo:', error);
        await msg.reply('⚠️ Hubo un error procesando el campo.');
    }
}


async function handleCampoCapture(msg) {
    try {
        const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
        
        if (!global.campoPokemonPendiente.has(whatsappId)) {
            return await msg.reply('❌ No hay ningún Pokémon esperando ser capturado en este momento.');
        }

        const poke = global.campoPokemonPendiente.get(whatsappId);
        const { registrarCaptura, restarPokeball } = require('../services/pokemonService');
        const { getCaptureRate, calcularProbabilidadCaptura } = require('../services/pokeapi'); //
        
        const [userRows] = await db.execute('SELECT id, pokeballs FROM usuarios WHERE whatsapp_id = ?', [whatsappId]);
        const usuario = userRows[0];

        if (usuario.pokeballs <= 0) {
            return await msg.reply('🎒 *¡No te quedan Pokéballs!*');
        }

        // --- LÓGICA DE PROBABILIDAD ---
        const captureRate = await getCaptureRate(poke); 
        const probabilidadExito = calcularProbabilidadCaptura(captureRate) / 100;
        const exito = Math.random() < probabilidadExito;

        if (exito) {
            const resultado = await registrarCaptura(usuario.id, poke.id, poke.name, 1, 0, false);
            if (resultado.success) {
                global.campoPokemonPendiente.delete(whatsappId);
                return await msg.reply(`🎉 ¡Felicidades! Has capturado a *${poke.name}*. (Ratio: ${Math.round(probabilidadExito * 100)}%)`);
            } else if (resultado.duplicate) {
                await restarPokeball(usuario.id); //[cite: 19]
                global.campoPokemonPendiente.delete(whatsappId);
                return await msg.reply('❌ ¡El Pokémon se escapó! Ya tenías uno y fallaste el 50/50.');
            }
        } else {
            // Caso de falla
            await restarPokeball(usuario.id); //[cite: 19]
            return await msg.reply(`💨 El Pokémon se movió bruscamente y la Pokéball falló. (Ratio: ${Math.round(probabilidadExito * 100)}%) ¡Sigue intentando!`);
        }

    } catch (error) {
        console.error('Error en handleCampoCapture:', error);
        await msg.reply('⚠️ Hubo un error al intentar capturar.');
    }
}

module.exports = { handleCampo, handleCampoCapture };