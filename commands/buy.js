const usuarioService = require('../services/usuarioService');
const tiendaService = require('../services/tiendaService'); // <--- NUEVO
const { replyText } = require('../services/reply');

async function handleBuy(msg, texto) {
  const partes = texto.replace('#buy', '').trim().split(' ');
  const codigo = partes[0];
  const cantidad = parseInt(partes[1]);

  if (!codigo || isNaN(cantidad) || cantidad <= 0) {
    return await replyText(msg, '❌ Formato incorrecto.\nUsa: `#buy (código) (cantidad)`\nEjemplo: `#buy 001 2`');
  }

  const whatsappId = msg.author ? msg.author.split('@')[0] : msg.from.split('@')[0];
  const usuario = await usuarioService.obtenerUsuario(whatsappId);
  
  if (!usuario) return await replyText(msg, '❌ Primero debes registrarte con #pokeregister');

  // Ahora llamamos al nuevo tiendaService
  const resultado = await tiendaService.procesarCompra(usuario.id, codigo, cantidad);

  switch(resultado.error) {
    case 'codigo_invalido':
      return await replyText(msg, '❌ Ese código de tienda no existe.');
    case 'fondos_insuficientes':
      return await replyText(msg, `💸 *Fondos insuficientes.*\nTienes ${resultado.saldo} monedas, pero necesitas ${resultado.costo} para esta compra.`);
  }

  if (resultado.exito) {
    return await replyText(msg, `✅ *¡Compra exitosa!* \nHas comprado ${resultado.cantidad} ${resultado.objeto}(s) por ${resultado.costo} monedas.`);
  }

  return await replyText(msg, '⚠️ Error al procesar la compra.');
}

module.exports = { handleBuy };