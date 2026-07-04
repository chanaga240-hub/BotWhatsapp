const { MessageMedia } = require('whatsapp-web.js'); 
const pokemonService = require('../services/pokemonService');
const { consultarPokemon, formatName } = require('../services/pokeapi');

async function handleIncubadora(msg) {
  const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
  const resultado = await pokemonService.revisarIncubadora(whatsappId);

  // ... (validaciones de error) ...
  if (resultado.error === 'usuario_no_encontrado') return await msg.reply('❌ No estás registrado como entrenador.');
  if (resultado.error === 'db_error') return await msg.reply('⚠️ Hubo un error interno al revisar tu incubadora.');
  if (resultado.estado === 'vacio') return await msg.reply('♨️ Tu incubadora está vacía en este momento.\nPuedes poner a incubar un huevo usando:\n👉 `#use egg`');

  let mensajeEspera = '';
  const chat = await msg.getChat();

  // 2. Mostrar los huevos que eclosionaron
  if (resultado.nacimientos && resultado.nacimientos.length > 0) {
    await msg.reply(`🎉 *¡Tus huevos están eclosionando!* 🥚✨`);
    
    for (const idApi of resultado.nacimientos) {
      try {
        const data = await consultarPokemon(idApi);
        const nombrePokemon = formatName ? formatName(data.name) : data.name;
        
        // MODIFICACIÓN AQUÍ: Añadimos 'true' como sexto parámetro (esIncubadora)
        await pokemonService.registrarCaptura(resultado.usuarioId, data.id, nombrePokemon, 1, 0, true);
        
        const textoNacimiento = `🎊 Ha nacido un *${nombrePokemon}* (Nivel 1).\n¡Se ha añadido a tu inventario!`;
        const hdUrl = data.sprites?.other?.['official-artwork']?.front_default || data.sprites?.front_default;
        
        if (hdUrl) {
          const media = await MessageMedia.fromUrl(hdUrl, { unsafeMime: true });
          
          await chat.sendMessage(media, { 
            caption: textoNacimiento 
          });
        } else {
          await chat.sendMessage(textoNacimiento);
        }

      } catch (err) {
        console.error('Error al procesar el nacimiento de un Pokémon:', err);
        await chat.sendMessage(`⚠️ Nació un Pokémon, pero hubo un error obteniendo su imagen.`);
      }
    }
  }

  // ... (resto del código de huevos en espera) ...
  if (resultado.enEspera && resultado.enEspera.length > 0) {
    mensajeEspera += `\n───────────────\n♨️ *HUEVOS EN INCUBACIÓN*\n`;
    
    resultado.enEspera.forEach((huevo, index) => {
      mensajeEspera += `🥚 Huevo ${index + 1}: Faltan *${huevo.horas}h y ${huevo.minutos}m*\n`;
    });

    await chat.sendMessage(mensajeEspera.trim());
  } else if (resultado.nacimientos && resultado.nacimientos.length > 0) {
    await chat.sendMessage(`♨️ Tu incubadora ahora está vacía.\nPuedes poner a incubar más huevos con:\n👉 \`#use egg\``);
  }
}

module.exports = { handleIncubadora };