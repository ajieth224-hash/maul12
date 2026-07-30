const {join} = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Mengarahkan Puppeteer untuk menginstal Chrome di dalam folder proyek ini
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
 g
