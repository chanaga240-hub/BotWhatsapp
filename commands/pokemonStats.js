const pokemonService = require('../services/pokemonService');
const { consultarPokemon, getStat, getImagen, getTiposEspanol } = require('../services/pokeapi');
const { MessageMedia } = require('whatsapp-web.js');

async function handlePokemonStats(msg) {
  try {
    const whatsappId = (msg.author || msg.from).split('@')[0].split(':')[0];
    const nombreBuscado = msg.body.replace(/^#pokemonstats/i, '').trim();
    
    if (!nombreBuscado) {
      return await msg.reply('❌ Especifica el nombre del Pokémon que deseas consultar.\n👉 Ejemplo: `#pokemonstats Pikachu`');
    }

    const pokeDB = await pokemonService.verificarYObtenerPokemon(whatsappId, nombreBuscado);
    
    if (!pokeDB) {
      return await msg.reply(`❌ No tienes ningún *${nombreBuscado}* registrado en tu Pokédex.`);
    }

    let dataApi;
    try {
      dataApi = await consultarPokemon(pokeDB.pokemon_id);
    } catch (apiError) {
      return await msg.reply('⚠️ Error al conectar con la PokéAPI para traer las estadísticas base.');
    }

    const pokedexId = dataApi.id;
    
    // 1. Obtenemos las estadísticas base puras
    const stats = {
      hp: getStat(dataApi, 'hp') || 0,
      atk: getStat(dataApi, 'attack') || 0,
      def: getStat(dataApi, 'defense') || 0,
      vel: getStat(dataApi, 'speed') || 0,
      spAtk: getStat(dataApi, 'special-attack') || 0,
      spDef: getStat(dataApi, 'special-defense') || 0,
    };

    // 2. Calculamos el multiplicador según el nivel actual del Pokémon
    const nivelActual = pokeDB.nivel || 1;
    const multNivel = 1 + (nivelActual - 1) * 0.05;

    // 3. Calculamos los totales usando las fórmulas de tu sistema de combate
    const hpTotal = Math.floor(stats.hp * 2 * multNivel);
    const atkTotal = Math.floor(stats.atk * multNivel);
    const defTotal = Math.floor(stats.def * multNivel);
    const spAtkTotal = Math.floor(stats.spAtk * multNivel);
    const spDefTotal = Math.floor(stats.spDef * multNivel);
    const velTotal = Math.floor(stats.vel * multNivel);

    // 4. Calculamos el "aumento" (la diferencia entre el total y la base)
    const bonoHp = hpTotal - stats.hp;
    const bonoAtk = atkTotal - stats.atk;
    const bonoDef = defTotal - stats.def;
    const bonoSpAtk = spAtkTotal - stats.spAtk;
    const bonoSpDef = spDefTotal - stats.spDef;
    const bonoVel = velTotal - stats.vel;

    let probEsquive = (stats.vel / 20) + (nivelActual > 1 ? nivelActual - 1 : 0);
    if (probEsquive > 30) probEsquive = 30;

    const fechaFormateada = new Date(pokeDB.atrapado_en).toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const tipos = await Promise.resolve(getTiposEspanol(dataApi));

    // 5. Construimos el mensaje mostrando Base + Bono = Total
    const mensaje = 
      `📊 *ESTADÍSTICAS INDIVIDUALES* 📊\r\n` +
      `────────────────────────\r\n` +
      `📝 *DATOS DE TU EJEMPLAR:*\r\n` +
      `👤 *Nombre:* ${pokeDB.nombre}\r\n` +
      `🏅 *Nivel:* ${nivelActual}\r\n` +
      `⭐ *Experiencia:* ${pokeDB.experiencia || 0} EXP\r\n` +
      `⚔️ *Combates Realizados:* ${pokeDB.combates || 0}\r\n` +
      `📅 *Capturado el:* ${fechaFormateada}\r\n` +
      `────────────────────────\r\n` +
      `🧬 *ESTADÍSTICAS ACTUALES (Base + Nivel):*\r\n` +
      `🔢 *Nº Pokedex:* #${pokedexId}\r\n` +
      `🏷️ *Tipo:* [ *${tipos}* ]\r\n` +
      `❤️ *HP:* ${stats.hp} + ${bonoHp} = *${hpTotal}*\r\n` +
      `⚔️ *Ataque:* ${stats.atk} + ${bonoAtk} = *${atkTotal}*\r\n` +
      `🛡️ *Defensa:* ${stats.def} + ${bonoDef} = *${defTotal}*\r\n` +
      `💥 *Atk. Especial:* ${stats.spAtk} + ${bonoSpAtk} = *${spAtkTotal}*\r\n` +
      `🔰 *Def. Especial:* ${stats.spDef} + ${bonoSpDef} = *${spDefTotal}*\r\n` +
      `⚡ *Velocidad:* ${stats.vel} \r\n` +
      `💨 *Prob. de Esquivar:* ${probEsquive.toFixed(1)}%`; 

    await msg.reply(mensaje);

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