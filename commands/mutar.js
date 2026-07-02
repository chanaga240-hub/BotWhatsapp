const { consultarPokemon, getVariantesPokemon, getNombreEspanol } = require('../services/pokeapi');
const pokemonService = require('../services/pokemonService');

// Función auxiliar para comparar las estadísticas (stats)
function sonStatsIguales(statsA, statsB) {
  if (!statsA || !statsB || statsA.length !== statsB.length) return false;
  for (let i = 0; i < statsA.length; i++) {
    // Compara el valor base de cada estadística (HP, Ataque, Defensa, etc.)
    if (statsA[i].base_stat !== statsB[i].base_stat) return false;
  }
  return true;
}

async function handleMutar(msg, texto) {
  const partes = texto.replace('#mutar', '').trim().split(' ');
  if (partes.length < 2) return await msg.reply('⚠️ *Uso:* #mutar [nombre_pokemon] [nombre_nueva_forma]');

  const nombrePokemon = partes[0];
  const nombreNuevaForma = partes.slice(1).join('-'); 

  const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
  const pokemon = await pokemonService.verificarYObtenerPokemon(whatsappId, nombrePokemon);

  if (!pokemon) return await msg.reply('❌ No tienes un Pokémon con ese nombre.');

  // 1. Obtener datos y variantes del Pokémon actual
  const data = await consultarPokemon(pokemon.pokemon_id);
  const todasLasVariantes = await getVariantesPokemon(data);

  // Filtramos las formas no deseadas
  const variantesFiltradas = todasLasVariantes.filter(v => {
    const nombre = v.toLowerCase();
    return !nombre.includes('-mega') && 
           !nombre.includes('-gmax') && 
           !nombre.includes('-primal');
  });

  // 2. Búsqueda flexible (normalizamos ambos lados para comparar)
  const formaEncontrada = variantesFiltradas.find(v => {
    const vNormalizado = v.toLowerCase().replace(/-/g, ' ');
    const inputNormalizado = nombreNuevaForma.toLowerCase().replace(/-/g, ' ');
    return vNormalizado === inputNormalizado;
  });

  if (!formaEncontrada) {
    return await msg.reply(
        `❌ Variante no encontrada para ${pokemon.nombre}.\n` +
        `Opciones válidas: ${variantesFiltradas.join(', ')}`
    );
  }

  // 3. Obtener los datos completos de la nueva forma seleccionada
  const dataNueva = await consultarPokemon(formaEncontrada);

  // 4. NUEVA LÓGICA: Comparar stats y validar Punta ADN
  const statsSonIguales = sonStatsIguales(data.stats, dataNueva.stats);

  // Si las stats cambian (no es estético) y no tiene el ítem, bloqueamos la mutación
  if (!statsSonIguales && !pokemon.punta_adn) {
    return await msg.reply('🧬 La nueva variante altera las estadísticas de combate. Tu Pokémon no tiene el ADN preparado (Punta ADN necesaria).');
  }

  // 5. Ejecutar cambio
  const exito = await pokemonService.cambiarVariantePokemon(pokemon.id, dataNueva.id, formaEncontrada);

  if (exito) {
    // Mensaje dinámico dependiendo de si costó ADN o fue estético
    const tipoMutacion = statsSonIguales ? '(Mutación Estética)' : '(Mutación de Combate)';
    await msg.reply(`✨ ¡Éxito! *${pokemon.nombre}* ha mutado a *${formaEncontrada}* ${tipoMutacion}.`);
  } else {
    await msg.reply('⚠️ Error al aplicar la mutación.');
  }
}

module.exports = { handleMutar };