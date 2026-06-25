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

async function consultarPokemon(param) {
  const url = `${POKEAPI_BASE}/${String(param).toLowerCase().trim()}`;
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

function randomPokemonId() {
  return Math.floor(Math.random() * 1025) + 1;
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
};
