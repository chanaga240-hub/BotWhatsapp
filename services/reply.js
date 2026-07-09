const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { MessageMedia } = require('whatsapp-web.js');

// Directorio raíz y configuración de FFmpeg
const rootDir = process.cwd(); 
const ffmpegPath = path.join(rootDir, 'bin', 'ffmpeg.exe');
const ffprobePath = path.join(rootDir, 'bin', 'ffprobe.exe');

if (!fs.existsSync(ffmpegPath)) {
  console.error(`\n❌ [ALERTA FFmpeg]: No se encontró ffmpeg.exe en: ${ffmpegPath}\n`);
} else {
  console.log(`\n✅ [FFmpeg Detectado]: Ejecutables vinculados con éxito en la raíz.\n`);
}

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
process.env.FFMPEG_PATH = ffmpegPath;

// ==========================================
// 1. FUNCIONES DE CARGA DE IMAGEN LOCAL
// ==========================================

async function fetchImageMedia(imagePath, filename = 'pokemon.png') {
  if (!imagePath) return null;

  try {
    // Verificamos si la ruta local (ej. C:\...\796.png) existe en el disco duro
    if (fs.existsSync(imagePath)) {
      return MessageMedia.fromFilePath(imagePath);
    } else {
      console.warn(`⚠️ No se encontró la imagen local en: ${imagePath}`);
      return null;
    }
  } catch (error) {
    console.warn(`⚠️ Error al cargar imagen local (${imagePath}):`, error.message);
    return null;
  }
}

// Mantenemos este nombre para no romper los comandos que lo importan,
// pero ahora su única función es procesar la ruta local.
async function getMediaFromUrlWithCache(imagePath, filename = 'pokemon.png') {
  return fetchImageMedia(imagePath, filename);
}

async function sendSticker(chat, imagePath, stickerName, quoteId) {
  const safeName = String(stickerName || 'pokemon').substring(0, 30);
  const media = await fetchImageMedia(imagePath, `${safeName}.png`);
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

// ==========================================
// 2. FUNCIONES DE RESPUESTA EXPORTADAS
// ==========================================

async function replyText(msg, text) {
  if (!msg || typeof msg.reply !== 'function') {
    console.error('replyText: msg inválido o sin método reply');
    throw new Error('No se puede enviar respuesta: mensaje inválido.');
  }
  return msg.reply(text);
}

async function replyWithSticker(msg, texto, imagePath, stickerName = 'pokemon') {
  const isRealMessage = msg && typeof msg.reply === 'function';

  if (isRealMessage) {
    await msg.reply(texto);
  } else {
    const bot = require('./bot'); 
    const chatId = msg.id && msg.id.remote ? msg.id.remote : msg;
    await bot.client.sendMessage(chatId, texto);
  }

  if (!imagePath) return;

  const chatId = isRealMessage ? msg.id.remote : (msg.id ? msg.id.remote : msg);
  const bot = require('./bot');
  const chat = await bot.client.getChatById(chatId);
  
  await sendSticker(chat, imagePath, stickerName, isRealMessage ? msg.id._serialized : null);
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
        // item.url ahora contiene la ruta local del disco duro
        await sendSticker(chat, item.url, item.stickerName || 'pokemon', quoteId);
      }
    }
  };

  if (textFirst && text) await msg.reply(text);
  await sendStickers();
  if (!textFirst && text) await msg.reply(text);
}

async function replyWithImage(msg, imagePath, caption = '') {
  if (!msg || typeof msg.reply !== 'function') {
    console.error('replyWithImage: msg inválido o sin método reply');
    throw new Error('No se puede enviar imagen: mensaje inválido.');
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`replyWithImage: no se encontró la imagen en la ruta ${imagePath}`);
    return await replyText(msg, caption || 'La imagen de ayuda no está disponible.');
  }

  try {
    const media = MessageMedia.fromFilePath(imagePath);
    const chat = await msg.getChat();
    const options = { quotedMessageId: msg.id._serialized };
    if (caption) options.caption = caption;
    return await chat.sendMessage(media, options);
  } catch (error) {
    console.error('Error al enviar imagen de ayuda:', error);
    return await replyText(msg, caption || 'No se pudo enviar la imagen de ayuda.');
  }
}

const { execFile } = require('child_process');

async function replyWithAudio(msg, audioUrl) {
  if (!audioUrl) return;

  const rootDir = process.cwd();
  const currentFfmpegPath = path.join(rootDir, 'bin', 'ffmpeg.exe');
  
  const tempOgg = path.join(rootDir, `temp_${Date.now()}.ogg`);
  const tempMp3 = path.join(rootDir, `temp_${Date.now()}.mp3`);

  try {
    // Los audios SÍ siguen siendo URLs web, así que este fetch se mantiene.
    const response = await fetch(audioUrl);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    fs.writeFileSync(tempOgg, Buffer.from(arrayBuffer));

    await new Promise((resolve, reject) => {
      execFile(currentFfmpegPath, ['-i', tempOgg, tempMp3, '-y'], (error) => {
        if (error) {
          return reject(new Error(`Error en comando directo FFmpeg: ${error.message}`));
        }
        resolve();
      });
    });

    if (!fs.existsSync(tempMp3)) throw new Error('El archivo MP3 no fue generado.');
    const mp3Buffer = fs.readFileSync(tempMp3);
    const base64Data = mp3Buffer.toString('base64');

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
    if (fs.existsSync(tempOgg)) fs.unlinkSync(tempOgg);
    if (fs.existsSync(tempMp3)) fs.unlinkSync(tempMp3);
  }
}

module.exports = {
  replyText,
  replyWithSticker,
  replyWithLabeledStickers,
  replyWithImage,
  replyWithAudio,
  getMediaFromUrlWithCache,
};