const { replyText } = require('../services/reply');

async function handleShop(msg) {
  const mensaje = 
    `🏪 *TIENDA POKÉMON* 🏪\n\n` +
    `Aquí tienes el catálogo de objetos disponibles:\n` +
    `👉 https://docs.google.com/presentation/d/18xLT6uA31yHOcHsPRjx4_-1DWEynRjuojGM3NpfhkzQ/edit?usp=sharing\n\n` +
    `──────────────────────\n` +
    `Para comprar, utiliza el comando:\n` +
    `#buy (Código_tienda) (cantidad)`;

  return await replyText(msg, mensaje);
}

module.exports = { handleShop };