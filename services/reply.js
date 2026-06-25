const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { MessageMedia } = require('whatsapp-web.js');

// process.cwd() se para firmemente en la raíz: C:\Users\USER\Desktop\BotWhatsapp
const rootDir = process.cwd(); 
const ffmpegPath = path.join(rootDir, 'bin', 'ffmpeg.exe');
const ffprobePath = path.join(rootDir, 'bin', 'ffprobe.exe');

// Validación automática en tu consola al arrancar
if (!fs.existsSync(ffmpegPath)) {
  console.error(`\n❌ [ALERTA FFmpeg]: No se encontró ffmpeg.exe en: ${ffmpegPath}\n`);
} else {
  console.log(`\n✅ [FFmpeg Detectado]: Ejecutables vinculados con éxito en la raíz.\n`);
}

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
process.env.FFMPEG_PATH = ffmpegPath;

// 2. Funciones auxiliares internas
async function fetchImageMedia(imageUrl, filename = 'pokemon.png') {
  if (!imageUrl) return null;

  try {
    return await MessageMedia.fromUrl(imageUrl, { filename, unsafeMime: true });
  } catch (error) {
    console.warn(`No se pudo descargar imagen (${imageUrl}):`, error.message);
    return null;
  }
}

async function sendSticker(chat, imageUrl, stickerName, quoteId) {
  const safeName = String(stickerName || 'pokemon').substring(0, 30);
  const media = await fetchImageMedia(imageUrl, `${safeName}.png`);
  if (!media) return false;

  try {
    await chat.sendMessage(media, {
      sendMediaAsSticker: true,
      stickerName: safeName,
      quotedMessageId: quoteId,
    });
    return true;
  } catch (error) {
    console.warn(`Falló envío de sticker (${safeName}):`, error.message);
    return false;
  }
}

// 3. Funciones de respuesta exportadas
async function replyText(msg, text) {
  if (!msg || typeof msg.reply !== 'function') {
    console.error('replyText: msg inválido o sin método reply');
    throw new Error('No se puede enviar respuesta: mensaje inválido.');
  }
  return msg.reply(text);
}

async function replyWithSticker(msg, texto, imageUrl, stickerName = 'pokemon') {
  // 1. Identificar si es mensaje de usuario (msg) o solo un objeto { id: { remote: groupId } }
  const isRealMessage = msg && typeof msg.reply === 'function';

  // 2. Enviar texto de forma segura
  if (isRealMessage) {
    await msg.reply(texto);
  } else {
    // Si viene del cron, no usamos msg.reply, usamos el cliente.
    // IMPORTANTE: Para evitar el require circular, inyectaremos el cliente o lo obtendremos del bot manager
    const bot = require('./bot'); 
    const chatId = msg.id && msg.id.remote ? msg.id.remote : msg;
    await bot.client.sendMessage(chatId, texto);
  }

  // 3. Envío del sticker (Evita usar msg.getChat() que es lo que rompe todo)
  if (!imageUrl) return;

  const chatId = isRealMessage ? msg.id.remote : (msg.id ? msg.id.remote : msg);
  
  // En lugar de await msg.getChat(), usa esto que es más seguro:
  const bot = require('./bot');
  const chat = await bot.client.getChatById(chatId);
  
  await sendSticker(chat, imageUrl, stickerName, isRealMessage ? msg.id._serialized : null);
}

async function replyWithLabeledStickers(msg, text, labeledItems, textFirst = false) {
  const chat = await msg.getChat();
  const quoteId = msg.id._serialized;

  const sendStickers = async () => {
    for (const item of labeledItems) {
      if (item.label) {
        await chat.sendMessage(item.label, { quotedMessageId: quoteId });
      }

      if (item.url) {
        await sendSticker(chat, item.url, item.stickerName || 'pokemon', quoteId);
      }
    }
  };

  if (textFirst && text) {
    await msg.reply(text);
  }

  await sendStickers();

  if (!textFirst && text) {
    await msg.reply(text);
  }
}

const { execFile } = require('child_process'); // Pon esto arriba o dentro de la función

async function replyWithAudio(msg, audioUrl) {
  if (!audioUrl) return;

  const rootDir = process.cwd();
  const currentFfmpegPath = path.join(rootDir, 'bin', 'ffmpeg.exe');
  
  const tempOgg = path.join(rootDir, `temp_${Date.now()}.ogg`);
  const tempMp3 = path.join(rootDir, `temp_${Date.now()}.mp3`);

  try {
    // 1. Descargamos el .ogg de la PokéAPI
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(tempOgg, Buffer.from(arrayBuffer));

    // 2. CONVERSIÓN FORZADA POR COMANDO DIRECTO DE WINDOWS
    // Ejecuta: ffmpeg.exe -i temp.ogg temp.mp3 -y
    await new Promise((resolve, reject) => {
      execFile(currentFfmpegPath, ['-i', tempOgg, tempMp3, '-y'], (error) => {
        if (error) {
          return reject(new Error(`Error en comando directo FFmpeg: ${error.message}`));
        }
        resolve();
      });
    });

    // 3. Leemos el MP3 real generado
    if (!fs.existsSync(tempMp3)) throw new Error('El archivo MP3 no fue generado.');
    const mp3Buffer = fs.readFileSync(tempMp3);
    const base64Data = mp3Buffer.toString('base64');

    // 4. Lo enviamos a WhatsApp
    const media = new MessageMedia('audio/mp3', base64Data, 'grito.mp3');
    const chat = await msg.getChat();
    await chat.sendMessage(media, {
      quotedMessageId: msg.id._serialized
    });

    console.log(`[Bot] ¡Grito convertido por fuerza bruta a MP3 y enviado con éxito!`);

  } catch (error) {
    console.warn(`Falló la conversión nativa de audio (${audioUrl}):`, error.message || error);
    throw error;
  } finally {
    // Limpieza de archivos del disco
    if (fs.existsSync(tempOgg)) fs.unlinkSync(tempOgg);
    if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
  }
}

module.exports = {
  replyText,
  replyWithSticker,
  replyWithLabeledStickers,
  replyWithAudio,
};