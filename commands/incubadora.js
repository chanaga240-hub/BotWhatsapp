const { MessageMedia } = require('whatsapp-web.js'); 
const pokemonService = require('../services/pokemonService');
const { consultarPokemon, formatName, getImagen } = require('../services/pokeapi');

async function handleIncubadora(msg) {
  const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
  const resultado = await pokemonService.revisarIncubadora(whatsappId);

  // Validaciones iniciales
  if (resultado.error === 'usuario_no_encontrado') return await msg.reply('❌ No estás registrado como entrenador.');
  if (resultado.error === 'db_error') return await msg.reply('⚠️ Hubo un error interno al revisar tu incubadora.');
  if (resultado.estado === 'vacio') return await msg.reply('♨️ Tu incubadora está vacía en este momento.\nPuedes poner a incubar un huevo usando:\n👉 `#use egg`');

  let mensajeEspera = '';

  // 1. Mostrar los huevos que eclosionaron
  if (resultado.nacimientos && resultado.nacimientos.length > 0) {
    await msg.reply(`🎉 *¡Tus huevos están eclosionando!* 🥚✨`);
    
    for (const nacimiento of resultado.nacimientos) {
      try {
        const data = await consultarPokemon(nacimiento.pokemonId);
        const nombrePokemon = formatName ? formatName(data.name) : data.name;
        
        const resultadoCaptura = await pokemonService.registrarCaptura(resultado.usuarioId, data.id, nombrePokemon, 1, 0, true);
        if (resultadoCaptura?.success) {
          await pokemonService.eliminarHuevoIncubadora(nacimiento.incubadoraId);
        } else if (resultadoCaptura?.duplicate) {
          await msg.reply(`⚠️ El Pokémon *${nombrePokemon}* ya estaba en tu inventario, así que el huevo no se completó y quedó pendiente.`);
          continue;
        }
        
        const textoNacimiento = `🎊 Ha nacido un *${nombrePokemon}* (Nivel 1).\n¡Se ha añadido a tu inventario!`;
        const rutaImagen = getImagen(data);
        
        if (rutaImagen) {
          try {
            const media = MessageMedia.fromFilePath(rutaImagen);
            // msg.reply admite enviar multimedia con su caption sin necesidad de getChat()
            await msg.reply(media, undefined, { caption: textoNacimiento });
          } catch (e) {
            console.error('Error cargando imagen local en incubadora:', e.message);
            await msg.reply(textoNacimiento);
          }
        } else {
          await msg.reply(textoNacimiento);
        }

      } catch (err) {
        console.error('Error al procesar el nacimiento de un Pokémon:', err);
        await msg.reply(`⚠️ Nació un Pokémon, pero hubo un error obteniendo su imagen.`);
      }
    }
  }

  // 2. Mostrar los huevos que siguen en espera
  if (resultado.enEspera && resultado.enEspera.length > 0) {
    mensajeEspera += `\n───────────────\n♨️ *HUEVOS EN INCUBACIÓN*\n`;
    
    resultado.enEspera.forEach((huevo, index) => {
      mensajeEspera += `🥚 Huevo ${index + 1}: Faltan *${huevo.horas}h y ${huevo.minutos}m*\n`;
    });

    await msg.reply(mensajeEspera.trim());
  } else if (resultado.nacimientos && resultado.nacimientos.length > 0) {
    await msg.reply(`♨️ Tu incubadora ahora está vacía.\nPuedes poner a incubar más huevos con:\n👉 \`#use egg\``);
  }
}

module.exports = { handleIncubadora };