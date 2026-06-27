const db = require('./database');
const POKEAPI_BASE = 'https://pokeapi.co/api/v2/pokemon';


const speciesCache = new Map();
const abilityCache = new Map();

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

async function consultarPokemon(param) {
  const ident = normalizeForApi(param);
  const url = `${POKEAPI_BASE}/${ident}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('No se encontró el Pokémon');
  }

  return response.json();
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error al consultar ${url}`);
  }
  return response.json();
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
  const nombres = await Promise.all(pokemon.abilities.map(getHabilidadEspanol));
  return nombres.join(', ');
}

function getTiposEspanol(pokemon) {
  return pokemon.types
    .map((entry) => TIPOS_ES[entry.type.name] || formatName(entry.type.name))
    .join(' / ');
}

function getStat(pokemon, statName) {
  return pokemon.stats.find((s) => s.stat.name === statName)?.base_stat ?? 50;
}

function getImagen(pokemon) {
  return (
    pokemon.sprites.other?.['official-artwork']?.front_default ||
    pokemon.sprites.front_default
  );
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
  obtenerMultiplicadorLocal
};
