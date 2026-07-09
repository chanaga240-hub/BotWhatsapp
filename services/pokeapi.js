const path = require('path');

const db = require('./database');
const POKEAPI_BASE = 'https://pokeapi.co/api/v2/pokemon';

const speciesCache = new Map();
const abilityCache = new Map();
const pokemonCacheByKey = new Map();
const pokemonCacheById = new Map();

async function getCachedData(queryKey) {
  if (pokemonCacheByKey.has(queryKey)) {
    return pokemonCacheByKey.get(queryKey);
  }

  const numericId = /^\d+$/.test(queryKey) ? Number(queryKey) : null;

  try {
    const query = numericId !== null
      ? 'SELECT data FROM pokemon_cache WHERE query_key = ? OR pokemon_id = ? LIMIT 1'
      : 'SELECT data FROM pokemon_cache WHERE query_key = ? LIMIT 1';
    const params = numericId !== null ? [queryKey, numericId] : [queryKey];

    const [rows] = await db.execute(query, params);

    if (rows.length) {
      const data = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
      pokemonCacheByKey.set(queryKey, data);
      if (data?.id) {
        pokemonCacheById.set(String(data.id), data);
      }
      return data;
    }
  } catch (err) {
    console.warn('Error consultando caché en DB:', err.message);
  }

  return null;
}

async function cacheJsonResponse(data, queryKey, fallbackName = null, fallbackId = null) {
  if (!data || !queryKey) return;

  pokemonCacheByKey.set(queryKey, data);
  if (fallbackId || data?.id) {
    pokemonCacheById.set(String(fallbackId || data.id), data);
  }

  try {
    await db.execute(
      'INSERT INTO pokemon_cache (pokemon_id, query_key, name, data) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), data = VALUES(data), updated_at = CURRENT_TIMESTAMP',
      [fallbackId || data?.id || null, queryKey, fallbackName || data?.name || null, JSON.stringify(data)]
    );
  } catch (err) {
    console.warn('Error guardando caché en DB:', err.message);
  }
}

const TIPOS_ES = {
  normal: 'Normal',
  fire: 'Fuego',
  water: 'Agua',
  electric: 'Eléctrico',
  grass: 'Planta',
  ice: 'Hielo',
  fighting: 'Lucha',
  poison: 'Veneno',
  ground: 'Tierra',
  flying: 'Volador',
  psychic: 'Psíquico',
  bug: 'Bicho',
  rock: 'Roca',
  ghost: 'Fantasma',
  dragon: 'Dragón',
  dark: 'Siniestro',
  steel: 'Acero',
  fairy: 'Hada',
};

function formatName(name) {
  return String(name)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeForApi(param) {
  if (param === undefined || param === null) return '';
  const num = String(param).trim();
  // If it's purely numeric, return as-is
  if (/^\d+$/.test(num)) return num;

  let s = String(param).toLowerCase().trim();

  // Map gender symbols to explicit suffixes used by the API
  s = s.replace(/♀/g, '-f').replace(/♂/g, '-m');

  // Remove diacritics (accents)
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Replace spaces with hyphens (API uses hyphens for multi-word names)
  s = s.replace(/\s+/g, '-');

  // Remove common apostrophes and similar punctuation characters
  s = s.replace(/[’'`´]/g, '');

  // Keep only a-z, 0-9 and hyphens
  s = s.replace(/[^a-z0-9-]/g, '');

  return s;
}

function hasPokemonShape(data) {
  return !!data && typeof data === 'object' && (typeof data.id !== 'undefined' || typeof data.name !== 'undefined');
}

async function consultarPokemon(param) {
  return fetchPokemon(param);
}

async function fetchPokemon(param) {
  const rawValue = String(param ?? '').trim();
  if (!rawValue) {
    throw new Error('Parámetro de Pokémon inválido');
  }

  const queryKey = normalizeForApi(rawValue);
  if (!queryKey) {
    throw new Error('Parámetro de Pokémon inválido');
  }

  const cached = await getCachedData(queryKey);
  if (cached && hasPokemonShape(cached)) {
    if (Array.isArray(cached.stats) && cached.sprites) {
      return cached;
    }

    if (Array.isArray(cached.stats)) {
      return cached;
    }

    if (cached.sprites) {
      return cached;
    }
  }

  const url = `${POKEAPI_BASE}/${queryKey}`;

  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`Error de red al consultar la API de Pokémon: ${err.message}`);
  }

  if (!response.ok) {
    if (response.status === 404) {
      const fallback = await tryResolvePokemonName(rawValue);
      if (fallback) {
        return fallback;
      }
      throw new Error('No se encontró el Pokémon');
    }
    if (response.status === 429) {
      throw new Error('Límite de solicitudes alcanzado en la API de Pokémon');
    }
    throw new Error(`Error al consultar la API de Pokémon: ${response.status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error(`Error decodificando la respuesta de la API de Pokémon: ${err.message}`);
  }

  await cacheJsonResponse(data, queryKey, data.name, data.id);
  return data;
}

async function tryResolvePokemonName(input) {
  const normalized = normalizeForApi(input);
  if (!normalized) {
    return null;
  }

  try {
    const cached = await getCachedData(normalized);
    if (cached) {
      return cached;
    }

    const url = `https://pokeapi.co/api/v2/pokemon-species/${normalized}`;
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const speciesData = await response.json();
    const pokemonName = speciesData?.name;
    if (!pokemonName) {
      return null;
    }

    const pokemonUrl = `${POKEAPI_BASE}/${pokemonName}`;
    const pokemonResponse = await fetch(pokemonUrl);
    if (!pokemonResponse.ok) {
      return null;
    }

    const pokemonData = await pokemonResponse.json();
    await cacheJsonResponse(pokemonData, normalizeForApi(pokemonData.name), pokemonData.name, pokemonData.id);
    return pokemonData;
  } catch (err) {
    console.warn('No se pudo resolver el nombre alternativo:', err.message);
    return null;
  }
}

async function fetchJson(url) {
  const cacheKey = String(url);
  const cached = await getCachedData(cacheKey);
  if (cached) {
    return cached;
  }

  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`Error de red al consultar ${url}: ${err.message}`);
  }

  if (!response.ok) {
    throw new Error(`Error al consultar ${url}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error(`Error decodificando la respuesta de ${url}: ${err.message}`);
  }

  await cacheJsonResponse(data, cacheKey);
  return data;
}

async function getNombreEspanol(pokemon) {
  const speciesUrl = pokemon.species?.url;
  if (!speciesUrl) {
    return formatName(pokemon.name);
  }

  if (speciesCache.has(speciesUrl)) {
    return speciesCache.get(speciesUrl);
  }

  try {
    const data = await fetchJson(speciesUrl);
    const esName = data.names?.find((entry) => entry.language.name === 'es')?.name;
    const nombre = esName || formatName(pokemon.name);
    speciesCache.set(speciesUrl, nombre);
    return nombre;
  } catch {
    return formatName(pokemon.name);
  }
}

async function getHabilidadEspanol(abilityEntry) {
  const abilityName = abilityEntry.ability.name;

  if (abilityCache.has(abilityName)) {
    return abilityCache.get(abilityName);
  }

  try {
    const data = await fetchJson(abilityEntry.ability.url);
    const esName = data.names?.find((entry) => entry.language.name === 'es')?.name;
    const nombre = esName || formatName(abilityName);
    abilityCache.set(abilityName, nombre);
    return nombre;
  } catch {
    return formatName(abilityName);
  }
}

async function getHabilidadesEspanol(pokemon) {
  const abilities = Array.isArray(pokemon?.abilities) ? pokemon.abilities : [];
  const nombres = await Promise.all(abilities.map(getHabilidadEspanol));
  return nombres.join(', ');
}

function getTiposEspanol(pokemon) {
  const types = Array.isArray(pokemon?.types) ? pokemon.types : [];
  return types
    .map((entry) => TIPOS_ES[entry?.type?.name] || formatName(entry?.type?.name))
    .join(' / ');
}

function getStat(pokemon, statName) {
  const stats = Array.isArray(pokemon?.stats) ? pokemon.stats : [];
  return stats.find((s) => s?.stat?.name === statName)?.base_stat ?? 50;
}

function getImagen(pokemon) {
  if (!pokemon || !pokemon.id) return null;
  
  // path.join armará la ruta correcta independientemente de tu sistema operativo.
  // Asumo que tus imágenes están en formato .png (Ej: "1.png", "10001.png").
  // Si están en .jpg o .webp, simplemente cambia la extensión aquí abajo.
  // Nota: Si la carpeta "imagenes" está en la raíz de tu proyecto y "pokeapi.js" está dentro de "services",
  // '..' nos saca de "services" hacia la raíz.
  return path.join(__dirname, '..', 'imagenes', `${pokemon.id}.png`);
}

function getAudioGrito(pokemon) {
  return pokemon.cries?.latest || pokemon.cries?.legacy || null;
}

/**
 * Obtiene el capture_rate desde la API de pokemon-species.
 * Retorna un número entre 1 y 255.
 * Si falla, retorna 45 (promedio aproximado).
 */
async function getCaptureRate(pokemon) {
  const speciesUrl = pokemon.species?.url;
  if (!speciesUrl) {
    return 45; // Default aproximado si no hay URL de species
  }

  try {
    const speciesData = await fetchJson(speciesUrl);
    return speciesData.capture_rate ?? 45;
  } catch {
    return 45; // Default si la consulta falla
  }
}

/**
 * Calcula la probabilidad de captura basada en el capture_rate.
 * Fórmula: (capture_rate / 255 × 80) + 5
 * Retorna un número entre ~5% (legendarios) y ~85% (comunes).
 */
function calcularProbabilidadCaptura(captureRate) {
  return (captureRate / 255 * 80) + 5;
}

function randomPokemonId() {
  return Math.floor(Math.random() * 1025) + 1;
}

async function obtenerMultiplicadorLocal(tipoAtacante, tiposDefensor) {
  let multiplicadorTotal = 1;
  const tipos = Array.isArray(tiposDefensor) ? tiposDefensor : [tiposDefensor];

  if (tipos.length === 0) return 1;

  try {
    // 1. OPTIMIZACIÓN SQL: Preparamos los placeholders (?, ?) según la cantidad de tipos del defensor
    const placeholders = tipos.map(() => '?').join(',');
    const queryParams = [tipoAtacante, ...tipos];

    // Hacemos un solo viaje a la BD usando IN ()
    const [relaciones] = await db.execute(`
      SELECT r.multiplicador 
      FROM tipos_relaciones r
      JOIN tipos_pokemon t_at ON r.tipo_atacante_id = t_at.id
      JOIN tipos_pokemon t_def ON r.tipo_defensor_id = t_def.id
      WHERE t_at.nombre = ? AND t_def.nombre IN (${placeholders})
    `, queryParams); 
    
    // Multiplicamos los resultados obtenidos
    for (const rel of relaciones) {
      multiplicadorTotal *= parseFloat(rel.multiplicador);
    }

    // 2. CORRECCIÓN MATEMÁTICA: Si hay un Súper Eficaz (1.25) y un Poco Eficaz (0.75)
    // el resultado es 0.9375. Lo forzamos a 1 para que sea un ataque Neutral perfecto.
    if (multiplicadorTotal === 0.9375) {
      multiplicadorTotal = 1;
    }

  } catch (error) {
    console.error(`Error consultando multiplicador BD:`, error);
  }

  return multiplicadorTotal;
}

// --- FUNCIONES PARA EVOLUCION ---

async function getEvolucionesInmediatas(pokemon) {
  // 1. Obtenemos los datos de la especie para encontrar la URL de la cadena
  const speciesData = await fetchJson(pokemon.species.url);
  const chainData = await fetchJson(speciesData.evolution_chain.url);

  // IMPORTANTE: Usamos el nombre de la especie, no el del Pokémon actual.
  // Así evitamos errores si el jugador consultó "lechonk-female".
  const targetSpeciesName = speciesData.name;

  // 2. Función recursiva para buscar la especie en la cadena
  function buscarEvoluciones(currentChain, targetName) {
    if (currentChain.species.name === targetName) {
      return currentChain.evolves_to.map(evo => evo.species.name);
    }
    for (const next of currentChain.evolves_to) {
      const found = buscarEvoluciones(next, targetName);
      if (found.length > 0) return found;
    }
    return [];
  }

  const especiesEvolucion = buscarEvoluciones(chainData.chain, targetSpeciesName);

  // 3. Consultamos las "varieties" (formas/géneros) de cada especie encontrada
  const evolucionesCompletas = [];
  
  for (const especie of especiesEvolucion) {
    try {
      const evoSpeciesData = await fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${especie}`);
      
      // Extraemos el nombre exacto de la API para cada variedad
      for (const variedad of evoSpeciesData.varieties) {
        evolucionesCompletas.push(variedad.pokemon.name);
      }
    } catch (err) {
      // Si falla la consulta extra, dejamos el nombre base como respaldo
      evolucionesCompletas.push(especie);
    }
  }

  return evolucionesCompletas;
}

async function getVariantesPokemon(pokemon) {
  const speciesUrl = pokemon.species?.url;
  
  if (!speciesUrl) {
    // Si por alguna razón no hay URL de especie, devolvemos el nombre normal
    return [pokemon.name];
  }

  try {
    const speciesData = await fetchJson(speciesUrl);
    // Mapeamos el array de varieties para sacar solo el nombre adaptado para la API
    return speciesData.varieties.map(variedad => variedad.pokemon.name);
  } catch (err) {
    console.error('Error obteniendo variantes:', err);
    return [pokemon.name];
  }
}

async function obtenerPokemonBebeAleatorio() {
  let idEncontrado = null;

  while (!idEncontrado) {
    const randomId = randomPokemonId(); 
    
    try {
      // 1. Consultamos los detalles de la especie
      const speciesData = await fetchJson(`https://pokeapi.co/api/v2/pokemon-species/${randomId}`);
      
      // 2. Buscamos su cadena evolutiva
      const chainData = await fetchJson(speciesData.evolution_chain.url);

      // 3. Extraemos SIEMPRE el primer Pokémon de la cadena (Forma Base)
      // Esto automáticamente incluye a los bebés reales y a todas las primeras evoluciones
      const nombreBase = chainData.chain.species.name; 
      
      const dataBase = await consultarPokemon(nombreBase);
      idEncontrado = dataBase.id; 
      
    } catch (error) {
      // Si la API falla por algún ID extraño o variante, lo ignoramos y buscamos otro
      console.error('Error buscando forma base, intentando con otro...');
    }
  }

  return idEncontrado;
}

// Asegúrate de agregar estas funciones al module.exports existente:
module.exports = {
  consultarPokemon,
  getNombreEspanol,
  getHabilidadesEspanol,
  getTiposEspanol,
  getStat,
  getImagen,
  randomPokemonId,
  formatName,
  getAudioGrito,
  getCaptureRate,
  calcularProbabilidadCaptura,
  obtenerMultiplicadorLocal,
  getEvolucionesInmediatas,
  getVariantesPokemon,
  obtenerPokemonBebeAleatorio,
  fetchPokemon
};