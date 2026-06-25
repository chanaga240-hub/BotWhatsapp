const cooldowns = new Map();

function isOnCooldown(chatId, command, cooldownMs) {
  const key = `${chatId}:${command}`;
  const lastUsed = cooldowns.get(key) ?? 0;
  return Date.now() - lastUsed < cooldownMs;
}

function setCooldown(chatId, command) {
  cooldowns.set(`${chatId}:${command}`, Date.now());
}

module.exports = {
  isOnCooldown,
  setCooldown,
};
