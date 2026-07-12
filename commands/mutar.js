const { consultarPokemon, getVariantesPokemon, getNombreEspanol } = require('../services/pokeapi');
const pokemonService = require('../services/pokemonService');
const usuarioService = require('../services/usuarioService');

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

  // Filtramos solo las formas no permitidas (Mega y Primal siguen bloqueadas para #mutar)
  // Se permite -gmax ahora para que entre en la lógica de comparación de stats.
  const variantesFiltradas = todasLasVariantes.filter(v => {
    const nombre = v.toLowerCase();
    return !nombre.includes('-mega') && 
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
        `Opciones válidas: ${variantesFiltradas.map(v => v.replace(/-/g, ' ')).join(', ')}`
    );
  }

  // 3. Obtener los datos completos de la nueva forma seleccionada
  const dataNueva = await consultarPokemon(formaEncontrada);

  // 4. LÓGICA: Comparar stats y validar Punta ADN
  const statsSonIguales = sonStatsIguales(data.stats, dataNueva.stats);
  
  // Obtenemos el inventario para verificar la punta_adn
  const inventario = await usuarioService.obtenerInventarioCompleto(whatsappId);
  const tieneADN = inventario && inventario.punta_adn > 0;

  // Si las stats cambian (es una forma que mejora o cambia stats) y no tiene el ítem, bloqueamos.
  // Si las stats son iguales (GMax estético), permitimos la mutación gratis.
  if (!statsSonIguales && !tieneADN) {
    return await msg.reply('🧬 La nueva variante altera las estadísticas de combate. Tu Pokémon no tiene el ADN preparado (Punta ADN necesaria).');
  }

  // 5. Ejecutar cambio
  const exito = await pokemonService.cambiarVariantePokemon(pokemon.id, dataNueva.id, formaEncontrada);

  if (exito) {
    // Si fue una mutación de combate, restamos el item (opcional, depende de tu implementación en service)
    const tipoMutacion = statsSonIguales ? '(Mutación Estética)' : '(Mutación de Combate)';
    await msg.reply(`✨ ¡Éxito! *${pokemon.nombre}* ha mutado a *${formaEncontrada}* ${tipoMutacion}.`);
  } else {
    await msg.reply('⚠️ Error al aplicar la mutación.');
  }
}

module.exports = { handleMutar };