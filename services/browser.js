const fs = require('fs');
const path = require('path');

const CANDIDATE_BROWSERS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
  path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Microsoft\\Edge\\Application\\msedge.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Microsoft\\Edge\\Application\\msedge.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
].filter(Boolean);

function resolveBrowserPath() {
  for (const candidate of CANDIDATE_BROWSERS) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getPuppeteerOptions() {
  const executablePath = resolveBrowserPath();

  const options = {
    headless: true,
    // Agregamos los flags de audio esenciales para evitar que falle al decodificar los gritos (.ogg)
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--autoplay-policy=no-user-gesture-required', // Permite procesar audio sin interacción humana
      '--disable-features=AudioServiceOutOfProcess'   // Previene bloqueos del subproceso de audio
    ],
  };

  if (executablePath) {
    options.executablePath = executablePath;
  }

  return { options, executablePath };
}

module.exports = {
  resolveBrowserPath,
  getPuppeteerOptions,
};