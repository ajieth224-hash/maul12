const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const axios = require('axios');
const fs = require('fs');
const express = require('express');

const listToken = fs.existsSync('tokens.txt') 
    ? fs.readFileSync('tokens.txt', 'utf8').split('\n').map(t => t.trim()).filter(Boolean) 
    : [];

const listCookie = fs.existsSync('cookies.txt') 
    ? fs.readFileSync('cookies.txt', 'utf8').split('\n').map(c => c.trim()).filter(Boolean) 
    : [];

const BOT_ID = '519287796549156864'; 
const YESCAPTCHA_TOKEN = '4833cd9be06f143f76fc531a5312404bbdb09dc0100535'; 

const LOG_WAKTU_FILE = 'last_votes.json';

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function logInfo(msg) { 
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    console.log(`[${now}] [Bot] ${msg}`); 
}

function bacaDataWaktu() {
    if (fs.existsSync(LOG_WAKTU_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(LOG_WAKTU_FILE, 'utf8'));
        } catch (e) {
            return {};
        }
    }
    return {};
}

function simpanDataWaktu(data) {
    fs.writeFileSync(LOG_WAKTU_FILE, JSON.stringify(data, null, 2));
}

async function solveTurnstile(page) {
    if (!YESCAPTCHA_TOKEN || YESCAPTCHA_TOKEN.includes('TOKEN_') || YESCAPTCHA_TOKEN.includes('GANTI_')) return;
    
    const siteKey = await page.evaluate(() => {
        const cfDiv = document.querySelector('.cf-turnstile');
        if (cfDiv) return cfDiv.getAttribute('data-sitekey');
        const iframe = document.querySelector('iframe[src*="turnstile"]');
        if (iframe) {
            const match = iframe.src.match(/sitekey=([^&]+)/);
            if (match) return match[1];
        }
        return null;
    });

    if (!siteKey) return; 
    
    logInfo("Mencari Cloudflare Turnstile/Captcha... Ditemukan!");
    logInfo(`Meminta bantuan YesCaptcha...`);
    try {
        const { data: createData } = await axios.post('https://api.yescaptcha.com/createTask', {
            clientKey: YESCAPTCHA_TOKEN,
            task: { type: "TurnstileTaskProxyless", websiteURL: await page.url(), websiteKey: siteKey }
        });

        if (createData.errorId !== 0) return logInfo(`Error YesCaptcha: ${createData.errorDescription}`);

        for (let i = 0; i < 15; i++) {
            await delay(5000);
            const { data: resData } = await axios.post('https://api.yescaptcha.com/getTaskResult', {
                clientKey: YESCAPTCHA_TOKEN, taskId: createData.taskId
            });

            if (resData.status === 'ready') {
                logInfo("YesCaptcha Berhasil! Menyuntikkan token bypass...");
                await page.evaluate((t) => {
                    const input = document.querySelector('[name="cf-turnstile-response"]');
                    if (input) { input.value = t; const form = input.closest('form'); if (form) form.submit(); }
                }, resData.solution.token);
                await delay(5000);
                return;
            }
        }
        logInfo("Waktu YesCaptcha habis.");
    } catch (err) { logInfo(`Gagal konek API YesCaptcha: ${err.message}`); }
}

async function processSingleAccount(token, cookies, accountIndex) {
    const shortT = token ? (token.slice(0, 5) + "...") : "KOSONG";
    const accountKey = `akun_${accountIndex + 1}_${shortT}`;
    
    const dataWaktu = bacaDataWaktu();
    const waktuTerakhir = dataWaktu[accountKey] || 0;
    const sekarang = Date.now();
    const duabelasJam = 12 * 60 * 60 * 1000;

    if (sekarang - waktuTerakhir < duabelasJam) {
        const sisaWaktuJam = ((duabelasJam - (sekarang - waktuTerakhir)) / (1000 * 60 * 60)).toFixed(1);
        logInfo(`\n--- Akun ke-${accountIndex + 1} dilewati ---`);
        logInfo(`⏳ Belum waktunya vote. Sisa waktu sekitar ${sisaWaktuJam} jam lagi.`);
        return "skipped";
    }

    logInfo(`\n--- Memulai akun ke-${accountIndex + 1}: ${shortT} ---`);

    if (!token) {
        logInfo("[GAGAL] Token tidak ditemukan untuk akun ini.");
        return "failed";
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--disable-gpu', 
                '--ignore-certificate-errors',
                '--disable-blink-features=AutomationControlled'
            ]
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        if (cookies && cookies.length > 0) {
            await page.setCookie(...cookies);
            logInfo("[SUKSES] Cookie terpasang!");
        }

        await page.evaluateOnNewDocument((t) => {
            const formattedToken = t.startsWith('"') ? t : `"${t}"`;
            try { window.localStorage.setItem('token', formattedToken); } catch (e) {}
        }, token);

        logInfo("Membuka Discord App...");
        await page.goto("https://discord.com/channels/@me", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
        await delay(4000);

        await page.evaluate((t) => {
            const formattedToken = t.startsWith('"') ? t : `"${t}"`;
            try { window.localStorage.setItem('token', formattedToken); } catch (e) {}
        }, token);

        logInfo("Menuju Login Top.gg...");
        await page.goto("https://top.gg/login", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
        await delay(6000); 
        await solveTurnstile(page);

        let currentUrl = page.url();
        if (currentUrl.includes("discord.com/oauth2")) {
            logInfo("Mengeksekusi bypass Otorisasi...");
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await delay(2000);
            
            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const scrollBtn = btns.find(b => (b.innerText || '').toLowerCase().includes('keep scrolling'));
                if (scrollBtn) scrollBtn.click();
            });
            await delay(2000);

            const authClicked = await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button'));
                const authBtn = btns.find(b => {
                    const txt = (b.innerText || '').toLowerCase();
                    return txt === 'authorize' || txt === 'otorisasi' || txt === 'authorise';
                });
                
                if (authBtn) {
                    authBtn.click();
                    return true;
                }
                return false;
            });

            if (authClicked) {
                logInfo("Tombol Otorisasi diklik! Menunggu...");
                await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
                await delay(4000);
            }
        }

        logInfo("Membuka halaman Vote...");
        await page.goto(`https://top.gg/bot/${BOT_ID}/vote`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
        
        logInfo("⏳ Jeda awal 15 detik...");
        await delay(15000);
        await solveTurnstile(page);
        
        await page.evaluate(() => window.scrollBy(0, 800)); 
        await delay(2000);

        logInfo("Mencari banner persetujuan privasi...");
        await page.evaluate(() => {
            const allElements = Array.from(document.querySelectorAll("button, a, [role='button']"));
            const agreeBtn = allElements.find(b => (b.innerText || '').trim().toLowerCase() === 'agree');
            if (agreeBtn) agreeBtn.click();
        });
        await delay(3000); 

        logInfo("Mencari tombol Vote (Menunggu iklan hitung mundur selesai jika ada)...");
        let btnData = { status: "not_found" };

        for (let attempt = 1; attempt <= 8; attempt++) {
            btnData = await page.evaluate(() => {
                const bodyText = document.body.innerText.toLowerCase();
                if (bodyText.includes("you have already voted") || bodyText.includes("already voted")) return { status: "already" };
                
                const btns = Array.from(document.querySelectorAll("button, a, [role='button']"));
                const voteBtn = btns.find(el => {
                    const text = (el.innerText || '').trim().toLowerCase();
                    return text === "vote" || text === "vote!" || text === "vote for bot";
                });

                if (voteBtn && !voteBtn.disabled) { 
                    voteBtn.scrollIntoView({ block: 'center', behavior: 'instant' });
                    const rect = voteBtn.getBoundingClientRect();
                    return {
                        status: "found",
                        x: rect.x + (rect.width / 2),
                        y: rect.y + (rect.height / 2)
                    };
                }
                return { status: "not_found" };
            });

            if (btnData.status !== "not_found") {
                break;
            }

            logInfo(`[TUNGGU] Iklan masih berjalan, cek lagi dalam 5 detik... (Percobaan ${attempt}/8)`);
            await delay(5000); 
        }

        if (btnData.status === "found") {
            logInfo("Tombol ditemukan! Melakukan klik mouse nyata...");
            await delay(1500); 
            await page.mouse.click(btnData.x, btnData.y); 
            
            await delay(3000);
            logInfo("Memeriksa apakah ada Captcha susulan setelah klik...");
            await solveTurnstile(page);
            await delay(6000); 

            const isSuccess = await page.evaluate(() => {
                const text = document.body.innerText.toLowerCase();
                return text.includes("thank you for voting") || text.includes("thanks for voting") || text.includes("already voted") || text.includes("successfully voted"); 
            });

            if (isSuccess) {
                logInfo(`[SUKSES] BERHASIL VOTE! 🎉`);
                dataWaktu[accountKey] = Date.now();
                simpanDataWaktu(dataWaktu);
                return "success";
            } else {
                logInfo(`[GAGAL] Tombol diklik tapi server menolak vote.`);
                return "failed";
            }

        } else if (btnData.status === "already") {
            logInfo(`[INFO] Sudah pernah vote.`);
            dataWaktu[accountKey] = Date.now();
            simpanDataWaktu(dataWaktu);
            return "success";
        } else {
            logInfo(`[GAGAL] Waktu habis. Tombol Vote tidak muncul.`);
            return "failed";
        }

    } catch (err) {
        logInfo(`Kesalahan sistem: ${err.message}`);
        return "failed";
    } finally {
        if (browser) await browser.close();
    }
}

async function runAll() {
    if (listToken.length === 0) {
        logInfo("File tokens.txt kosong atau tidak ditemukan.");
        return;
    }
    
    let akunGagal = [];

    logInfo(`🚀 Memulai siklus vote untuk ${listToken.length} akun...`);
    
    // Putaran Pertama
    for (let i = 0; i < listToken.length; i++) {
        let formattedCookie = [];
        if (listCookie[i]) {
            try { formattedCookie = JSON.parse(listCookie[i]); } catch (e) {}
        }
        
        const hasil = await processSingleAccount(listToken[i], formattedCookie, i);
        
        if (hasil === "failed") {
            akunGagal.push({ index: i, token: listToken[i], cookie: formattedCookie });
        }
        
        logInfo(`⏳ Menunggu 15 detik sebelum lanjut ke akun berikutnya...`);
        await delay(15000); 
    }

    // Putaran Kedua (Mencoba ulang akun yang gagal)
    if (akunGagal.length > 0) {
        logInfo(`\n🔄 Ada ${akunGagal.length} akun yang gagal pada putaran pertama. Memulai percobaan ulang (Retry)...`);
        await delay(10000);

        for (let item of akunGagal) {
            logInfo(`\n🔄 [RETRY] Mencoba ulang akun ke-${item.index + 1}...`);
            const hasilRetry = await processSingleAccount(item.token, item.cookie, item.index);
            
            if (hasilRetry === "success") {
                logInfo(`[RETRY SUKSES] Akun ke-${item.index + 1} akhirnya berhasil vote! 🎉`);
            } else {
                logInfo(`[RETRY GAGAL] Akun ke-${item.index + 1} tetap gagal pada percobaan ulang.`);
            }

            logInfo(`⏳ Menunggu 15 detik...`);
            await delay(15000);
        }
    }

    logInfo("🏁 Siklus vote keseluruhan selesai. Menunggu pemeriksaan berikutnya...");
}

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot Auto-Vote dengan sistem Retry & Time-Logging aktif!');
});

app.listen(PORT, () => {
    logInfo(`Web server menyala di port ${PORT}`);
    
    runAll();

    const SATU_JAM = 60 * 60 * 1000;
    setInterval(() => {
        logInfo("🔄 Menjalankan pemeriksaan berkala (tiap 1 jam)...");
        runAll();
    }, SATU_JAM);
});
