// commands/pokevariantes.js
const { consultarPokemon, getVariantesPokemon, getNombreEspanol } = require('../services/pokeapi');

async function handlePokeVariantes(msg, texto) {
  const nombreBusqueda = texto.replace('#pokevariantes', '').trim();
  
  if (!nombreBusqueda) {
    return await msg.reply('⚠️ *Uso:* #pokevariantes [nombre del pokemon]');
  }

  try {
    const data = await consultarPokemon(nombreBusqueda);
    const variantes = await getVariantesPokemon(data);

    // Si el array solo tiene 1 elemento, significa que no hay formas alternativas
    if (variantes.length <= 1) {
      return await msg.reply(`✨ *${await getNombreEspanol(data)}* no tiene variantes o formas alternativas registradas.`);
    }

    // Formateamos la lista capitalizando la primera letra pero dejando los guiones intactos
    const listaFormateada = variantes
      .map(nombre => `👉 ${nombre.charAt(0).toUpperCase() + nombre.slice(1)}`)
      .join('\n');

    return await msg.reply(
      `🎭 *VARIANTES DE LA ESPECIE* 🎭\n\n` +
      `El Pokémon *${await getNombreEspanol(data)}* tiene las siguientes formas:\n` +
      `${listaFormateada}`
    );
  } catch (err) {
    console.error(`Error en #pokevariantes: ${err.message}`);
    return await msg.reply('❌ No pude encontrar información de variantes para ese Pokémon.');
  }
}

module.exports = { handlePokeVariantes };