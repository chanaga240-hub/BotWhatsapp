// commands/pokeevolucion.js
const { consultarPokemon, getEvolucionesInmediatas, getNombreEspanol } = require('../services/pokeapi');
const db = require('../services/database'); // Requerimos la base de datos

async function handlePokeEvolucion(msg, texto) {
  const nombreBusqueda = texto.replace('#pokeevolucion', '').trim();
  
  if (!nombreBusqueda) {
    return await msg.reply('⚠️ *Uso:* #pokeevolucion [nombre del pokemon]');
  }

  try {
    let evoluciones = [];
    let nombreMostrado = "";

    try {
      // 1. Intentamos buscar en la PokéAPI Oficial
      const data = await consultarPokemon(nombreBusqueda);
      evoluciones = await getEvolucionesInmediatas(data);
      nombreMostrado = await getNombreEspanol(data);
    } catch (errApi) {
      // 2. Si falla la PokéAPI, buscamos en los registros personalizados
      const [customRows] = await db.execute(
        'SELECT * FROM pokemon_personalizados WHERE LOWER(nombre) = LOWER(?) LIMIT 1',
        [nombreBusqueda]
      );

      if (customRows.length > 0) {
        const p = customRows[0];
        nombreMostrado = p.nombre;
        
        // --- CORRECCIÓN: Usamos el campo fase_posterior para saber su evolución ---
        if (p.fase_posterior) {
          const [evosBD] = await db.execute(
            'SELECT nombre FROM pokemon_personalizados WHERE id = ?',
            [p.fase_posterior]
          );
          evoluciones = evosBD.map(evo => evo.nombre);
        } else {
          // Respaldo de seguridad por si solo se llenó el campo fase_previa en el evolucionado
          const [evosBD] = await db.execute(
            'SELECT nombre FROM pokemon_personalizados WHERE fase_previa = ?',
            [p.id]
          );
          evoluciones = evosBD.map(evo => evo.nombre);
        }

      } else {
        // Si tampoco está en la BD local, no existe
        return await msg.reply('❌ No pude encontrar información de evolución para ese Pokémon.');
      }
    }

    // Comprobamos si tiene evoluciones (ya sea oficial o custom)
    if (evoluciones.length === 0) {
      return await msg.reply(`✨ *${nombreMostrado}* ya ha alcanzado su forma final o no tiene evoluciones registradas.`);
    }

    // Capitalizamos solo la primera letra
    const listaFormateada = evoluciones
      .map(nombre => `👉 ${nombre.charAt(0).toUpperCase() + nombre.slice(1)}`)
      .join('\n');

    return await msg.reply(
      `🧬 *CADENA EVOLUTIVA* 🧬\n\n` +
      `El Pokémon *${nombreMostrado}* puede evolucionar a:\n` +
      `${listaFormateada}`
    );
  } catch (err) {
    console.error(`Error en #pokeevolucion: ${err.message}`);
    return await msg.reply('❌ Ocurrió un error inesperado al buscar las evoluciones.');
  }
}

module.exports = { handlePokeEvolucion };