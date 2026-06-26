const usuarioService = require('../services/usuarioService');
const { replyText } = require('../services/reply');

async function handlePay(msg, textoCompleto) {
  try {
    const mentionIds = msg.mentionedIds || [];
    if (mentionIds.length === 0) {
      return await replyText(msg, '❌ Debes mencionar a un entrenador con @ para pagar.\n👉 Ejemplo: `#pay @Marco 100`');
    }

    const destinatarioId = mentionIds[0].split('@')[0].split(':')[0];
    const remitenteId = (msg.author || msg.from).split('@')[0].split(':')[0];

    if (destinatarioId === remitenteId) {
      return await replyText(msg, '❌ No puedes enviarte monedas a ti mismo.');
    }

    // Extraemos la cantidad del texto
    const partes = textoCompleto.split(' ');
    const cantidad = parseInt(partes.find(p => !isNaN(p) && p !== ''));

    if (isNaN(cantidad) || cantidad <= 0) {
      return await replyText(msg, '❌ Debes indicar una cantidad válida de monedas.\n👉 Ejemplo: `#pay @Marco 100`');
    }

    const resultado = await usuarioService.transferirMonedas(remitenteId, destinatarioId, cantidad);

    if (resultado.error === 'fondos_insuficientes') return await replyText(msg, '💸 No tienes suficientes monedas para esta transacción.');
    if (resultado.error) return await replyText(msg, '⚠️ Error al procesar el pago.');

    return await replyText(msg, `✅ ¡Pago realizado con éxito! Has enviado *${cantidad} monedas* al entrenador.`);
  } catch (error) {
    console.error('Error en #pay:', error);
    return await replyText(msg, '⚠️ Ocurrió un error al procesar el pago.');
  }
}

module.exports = { handlePay };