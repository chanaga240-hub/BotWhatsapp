const usuarioService = require('../services/usuarioService');
const fs = require('fs');
const path = require('path');

const { replyText, replyWithImage } = require('../services/reply');

const HELP_IMAGE_PATH = path.join(process.cwd(), 'public', 'pokehelp.png');
const HELP_IMAGE_CAPTION = '📋 Guía de comandos Pokémon';

const AYUDA =
  `📋 *MENÚ GENERAL DE COMANDOS POKÉMON* 📋\r\n` +
  `───────────────────────\r\n\r\n` +
  
  `🆕 *GESTIÓN DE ENTRENADOR*\r\n` +
  `• *#pokeregister* - Crea tu perfil y recibe 10 Pokéballs 🎒.\r\n` +
  `• *#pokedaily* - Reclama 5 Pokéballs cada 24 horas 🎁.\r\n` +
  `• *#pokedex* - Muestra tus Pokémon capturados (vía privado 📬).\r\n` +
  `• *#pokestats* - Tus estadísticas de entrenador.\r\n` +
  `• *#pokestats @mención* - Estadísticas de otro entrenador.\r\n\r\n` +

  `🕵️ *EXPLORACIÓN Y CAPTURA*\r\n` +
  `• *#pokemon* - Información de un Pokémon aleatorio.\r\n` +
  `• *#pokemon [nombre]* - Busca un Pokémon específico.\r\n` +
  `• *#capture* - Intenta atrapar al Pokémon salvaje actual (20% éxito) 💥.\r\n` +
  `• *#pokerealease [nombre]* - Libera un Pokémon de tu Pokédex al entorno.
` +
  `• *#pokegive @mención [nombre]* - Dona un Pokémon a otro entrenador con todas sus estadísticas.\r\n\r\n` +

  `⚔️ *COMBATES Y ENTRENAMIENTO*\r\n` +
  `• *#pokebatle @mención [nombre]* - Reta a un amigo a un duelo.\r\n` +
  `• *#pokeaccept [nombre]* - Acepta un desafío usando tu propio Pokémon.\r\n` +
  `• *#poketrain [nombre]* - Entrenamiento intensivo (+5 EXP) 🏋️.\r\n\r\n` +

  `🔮 *EXTRAS Y UTILIDADES*\r\n` +
  `• *#poketeam* - Genera un equipo aleatorio de 6 Pokémon (Stickers).\r\n` +
  `• *#pokehelp* - Muestra esta guía de comandos.\r\n\r\n` +

  `───────────────────────\r\n` +
  `👑 *COMANDOS ADMIN*\r\n` +
  `• *#pokesalvaje* - Invoca un Pokémon salvaje en el grupo.\r\n\r\n` +
  `───────────────────────\r\n` +
  `🎒 _Nota: Los Pokémon se envían como stickers para optimizar el chat._`;

async function handlePokehelp(msg) {
  if (fs.existsSync(HELP_IMAGE_PATH)) {
    return await replyWithImage(msg, HELP_IMAGE_PATH, HELP_IMAGE_CAPTION);
  }

  return await replyText(msg, AYUDA);
}

module.exports = { handlePokehelp };