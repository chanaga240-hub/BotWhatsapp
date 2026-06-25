const { isOnCooldown, setCooldown } = require('../services/cooldown');
const { handlePokemon } = require('./pokemon');
const { handlePoketeam } = require('./poketeam');
const { handlePokebatle } = require('./pokebatle');
const { handlePokehelp } = require('./pokehelp');
const { handlePokeStats } = require('./pokestats');

const COOLDOWN_POKEMON_MS = 4000;
const COOLDOWN_POKETEAM_MS = 4000;
const COOLDOWN_POKEBATLE_MS = 5000;

async function handleCommand(msg) {
  const chatId = msg.from;
  const senderId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
  
  const textoCompleto = msg.body.trim();
  const textoMinuscula = textoCompleto.toLowerCase();

  if (textoMinuscula.startsWith('#pokemon')) {
    if (isOnCooldown(chatId, 'pokemon', COOLDOWN_POKEMON_MS)) return;
    setCooldown(chatId, 'pokemon');

    const argumentos = textoCompleto.substring(8).trim();
    if (argumentos.length > 0) {
      console.log('[!] Comando búsqueda por nombre detectado.');
      await handlePokemon(msg, argumentos);
    } else {
      console.log('[!] Comando individual aleatorio detectado.');
      await handlePokemon(msg, null);
    }
    return;
  }

  if (textoMinuscula === '#poketeam') {
    if (isOnCooldown(chatId, 'poketeam', COOLDOWN_POKETEAM_MS)) return;
    setCooldown(chatId, 'poketeam');

    console.log('[!] Comando de equipo (6) detectado.');
    await handlePoketeam(msg);
    return;
  }

  if (textoMinuscula.startsWith('#pokebatle')) {
    if (isOnCooldown(chatId, 'pokebatle', COOLDOWN_POKEBATLE_MS)) return;
    setCooldown(chatId, 'pokebatle');

    const rival = textoCompleto.substring(10).trim();

    console.log('[!] Comando de batalla detectado.');
    await handlePokebatle(msg, rival);
    return;
  }

  if (textoMinuscula.startsWith('#pokestats') || textoMinuscula.startsWith('#pokestas')) {
    let mentionIds = msg.mentionedIds || [];
    if (mentionIds.length === 0 && typeof msg.getMentions === 'function') {
      const mentions = await msg.getMentions();
      mentionIds = mentions.map((m) => m.id && m.id._serialized ? m.id._serialized : '').filter(Boolean);
    }

    if (textoMinuscula.startsWith('#pokestas')) {
      if (mentionIds.length === 0) {
        return await msg.reply('❌ Debes mencionar a un entrenador con @ para ver sus estadísticas.\n👉 Ejemplo: #pokestas @Marco');
      }
      const targetId = mentionIds[0].split('@')[0].split(':')[0];
      await handlePokeStats(msg, targetId);
    } else {
      await handlePokeStats(msg, null);
    }
    return;
  }

  if (textoMinuscula === '#pokehelp') {
    console.log('[!] Comando de ayuda detectado.');
    await handlePokehelp(msg);
  }
}

module.exports = { handleCommand };
