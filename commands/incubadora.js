const pokemonService = require('../services/pokemonService');
const { consultarPokemon, formatName } = require('../services/pokeapi');

async function handleIncubadora(msg) {
  const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
  const resultado = await pokemonService.revisarIncubadora(whatsappId);

  if (resultado.error === 'usuario_no_encontrado') return await msg.reply('❌ No estás registrado como entrenador.');
  if (resultado.error === 'db_error') return await msg.reply('⚠️ Hubo un error interno al revisar tu incubadora.');
  if (resultado.estado === 'vacio') return await msg.reply('♨️ Tu incubadora está vacía en este momento.\nPuedes poner a incubar un huevo usando:\n👉 `#use egg`');

  let mensaje = '';

  // 1. Mostrar los huevos que eclosionaron (si hubo)
  if (resultado.nacimientos && resultado.nacimientos.length > 0) {
    mensaje += `🎉 ¡Tus huevos están eclosionando! 🥚✨\n\n`;
    
    for (const idApi of resultado.nacimientos) {
      try {
        const data = await consultarPokemon(idApi);
        const nombrePokemon = formatName ? formatName(data.name) : data.name;
        
        await pokemonService.registrarCaptura(resultado.usuarioId, data.id, nombrePokemon, 1, 0);
        mensaje += `🎊 Ha nacido un *${nombrePokemon}* (Nivel 1).\n`;
      } catch (err) {
        mensaje += `⚠️ Un huevo eclosionó pero hubo un error obteniendo la info de la PokéAPI.\n`;
      }
    }
    mensaje += `\n¡Se han añadido a tu inventario!\n`;
  }

  // 2. Mostrar los huevos que siguen incubando (si quedaron)
  if (resultado.enEspera && resultado.enEspera.length > 0) {
    if (mensaje !== '') mensaje += `\n───────────────\n\n`; // Separador si nacieron y aún quedan otros
    mensaje += `♨️ *HUEVOS EN INCUBACIÓN*\n`;
    
    resultado.enEspera.forEach((huevo, index) => {
      mensaje += `🥚 Huevo ${index + 1}: Faltan *${huevo.horas}h y ${huevo.minutos}m*\n`;
    });
  }

  return await msg.reply(mensaje.trim());
}

module.exports = { handleIncubadora };