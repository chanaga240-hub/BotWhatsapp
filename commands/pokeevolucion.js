// commands/pokeevolucion.js
const { consultarPokemon, getEvolucionesInmediatas, getNombreEspanol } = require('../services/pokeapi');

async function handlePokeEvolucion(msg, texto) {
  const nombreBusqueda = texto.replace('#pokeevolucion', '').trim();
  
  if (!nombreBusqueda) {
    return await msg.reply('⚠️ *Uso:* #pokeevolucion [nombre del pokemon]');
  }

  try {
    const data = await consultarPokemon(nombreBusqueda);
    const evoluciones = await getEvolucionesInmediatas(data);

    if (evoluciones.length === 0) {
      return await msg.reply(`✨ *${data.name}* ya ha alcanzado su forma final o no tiene evoluciones registradas.`);
    }

    // Capitalizamos solo la primera letra pero mantenemos los guiones
    // para que el usuario sepa exactamente qué escribir en el comando.
    const listaFormateada = evoluciones
      .map(nombre => `👉 ${nombre.charAt(0).toUpperCase() + nombre.slice(1)}`)
      .join('\n'); // Usamos salto de línea en lugar de comas

    return await msg.reply(
      `🧬 *CADENA EVOLUTIVA* 🧬\n\n` +
      `El Pokémon *${await getNombreEspanol(data)}* puede evolucionar a:\n` +
      `${listaFormateada}`
    );
  } catch (err) {
    console.error(`Error en #pokeevolucion: ${err.message}`);
    return await msg.reply('❌ No pude encontrar información de evolución para ese Pokémon.');
  }
}

module.exports = { handlePokeEvolucion };