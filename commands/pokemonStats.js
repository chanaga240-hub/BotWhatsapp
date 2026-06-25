const pokemonService = require('../services/pokemonService');
const { consultarPokemon, getStat, getImagen } = require('../services/pokeapi');
const { MessageMedia } = require('whatsapp-web.js');

async function handlePokemonStats(msg) {
  try {
    // 1. Limpiamos el ID de WhatsApp del remitente
    const whatsappId = (msg.author || msg.from).split('@')[0].split(':')[0];

    // 2. Extraemos el argumento (nombre del Pokémon)
    const nombreBuscado = msg.body.replace(/^#pokemonstats/i, '').trim();
    
    if (!nombreBuscado) {
      return await msg.reply('❌ Especifica el nombre del Pokémon que deseas consultar.\n👉 Ejemplo: `#pokemonstats Pikachu`');
    }

    // 3. Buscamos el Pokémon en el inventario del usuario dentro de la DB
    const pokeDB = await pokemonService.verificarYObtenerPokemon(whatsappId, nombreBuscado);
    
    if (!pokeDB) {
      return await msg.reply(`❌ No tienes ningún *${nombreBuscado}* registrado en tu Pokédex.`);
    }

    // 4. Consultamos los datos globales y estadísticas base desde la PokéAPI
    let dataApi;
    try {
      dataApi = await consultarPokemon(pokeDB.pokemon_id);
    } catch (apiError) {
      return await msg.reply('⚠️ Error al conectar con la PokéAPI para traer las estadísticas base.');
    }

    // 5. Extraemos el ID nacional y las estadísticas de la API
    const pokedexId = dataApi.id;
    const stats = {
      hp: getStat(dataApi, 'hp') || 0,
      atk: getStat(dataApi, 'attack') || 0,
      def: getStat(dataApi, 'defense') || 0,
      vel: getStat(dataApi, 'speed') || 0,
      spAtk: getStat(dataApi, 'special-attack') || 0,
      spDef: getStat(dataApi, 'special-defense') || 0,
    };

    // 6. Formateamos estéticamente la fecha de captura (atrapado_en)
    let fechaCaptura = 'Desconocida';
    if (pokeDB.atrapado_en) {
      fechaCaptura = new Date(pokeDB.atrapado_en).toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    const fechaFormateada = new Date(pokeDB.atrapado_en).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
    });

    // 7. Estructuramos el mensaje final con la data combinada (DB + API)
    const mensaje = 
      `📊 *ESTADÍSTICAS INDIVIDUALEŚ* 📊\r\n` +
      `────────────────────────\r\n` +
      `📝 *DATOS DE TU EJEMPLAR:*\r\n` +
      `👤 *Nombre:* ${pokeDB.nombre}\r\n` +
      `🏅 *Nivel:* ${pokeDB.nivel || 1}\r\n` +
      `⭐ *Experiencia:* ${pokeDB.experiencia || 0} EXP\r\n` +
      `⚔️ *Combates Realizados:* ${pokeDB.combates || 0}\r\n` +
      `📅 *Capturado el:* ${fechaFormateada}\r\n` +
      `────────────────────────\r\n` +
      `🧬 *ESTADÍSTICAS BASE DE ESPECIE:*\r\n` +
      `🔢 *Nº Pokedex:* #${pokedexId}\r\n` +
      `❤️ *HP Base:* ${stats.hp}\r\n` +
      `⚔️ *Ataque Base:* ${stats.atk}\r\n` +
      `🛡️ *Defensa Base:* ${stats.def}\r\n` +
      `💥 *Atk. Especial:* ${stats.spAtk}\r\n` +
      `🔰 *Def. Especial:* ${stats.spDef}\r\n` +
      `⚡ *Velocidad:* ${stats.vel}`;

    // Enviamos primero la ficha técnica de texto
    await msg.reply(mensaje);

    // 8. Enviamos la imagen correspondiente convertida en Sticker del Pokémon
    const urlImagen = getImagen(dataApi);
    if (urlImagen) {
      const media = await MessageMedia.fromUrl(urlImagen, { unsafeMime: true });
      if (media) {
        const chat = await msg.getChat();
        await chat.sendMessage(media, {
          sendMediaAsSticker: true,
          stickerName: pokeDB.nombre,
          stickerAuthor: `Stats de Entrenador`
        });
      }
    }

  } catch (error) {
    console.error('Error en handlePokemonStats:', error);
    await msg.reply('⚠️ Hubo un error interno al compilar las estadísticas de tu Pokémon.');
  }
}

module.exports = { handlePokemonStats };