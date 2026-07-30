const puppeteer = require('puppeteer'); 
const axios = require('axios');
const fs = require('fs');
const express = require('express'); 

// === SETUP WEB SERVER (WAJIB UNTUK RENDER.COM) ===
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot Top.gg Auto Vote sedang berjalan aktif!');
});

app.listen(PORT, () => {
    console.log(`[SYSTEM] Web server berjalan di port ${PORT}`);
});
// =================================================

// === SISTEM DATABASE JADWAL LOKAL ===
const SCHEDULE_FILE = 'schedule.json';

function loadSchedule() {
    if (fs.existsSync(SCHEDULE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
        } catch (e) {
            console.log("[WARNING] Gagal membaca schedule.json. Membuat jadwal baru...");
            return {};
        }
    }
    return {};
}

function saveSchedule(schedule) {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2), 'utf8');
}
// =================================================

const listToken = fs.existsSync('tokens.txt') 
    ? fs.readFileSync('tokens.txt', 'utf8').split('\n').map(t => t.trim()).filter(Boolean) 
    : [];

const listCookie = fs.existsSync('cookies.txt') 
    ? fs.readFileSync('cookies.txt', 'utf8').split('\n').map(c => c.trim()).filter(Boolean) 
    : [];

const BOT_ID = '519287796549156864'; 
const YESCAPTCHA_TOKEN = '4833cd9be06f143f76fc531a5312404bbdb09dc0100535'; 

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function logInfo(msg) { console.log(`[Bot] ${msg}`); }

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

async function startVote(token, cookies, accountIndex) {
    const shortT = token ? (token.slice(0, 5) + "...") : "KOSONG";
    logInfo(`\n======================================================`);
    logInfo(`--- Memulai akun ke-${accountIndex + 1}: ${shortT} ---`);

    if (!token) {
        logInfo("[GAGAL] Token tidak ditemukan. Melewati...");
        return "error";
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true, 
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage', 
                '--disable-gpu', 
                '--ignore-certificate-errors'
            ]
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        if (cookies && cookies.length > 0) {
            await page.setCookie(...cookies);
            logInfo("[SUKSES] Cookie berhasil dipasang!");
        } else {
            logInfo("[INFO] Tidak ada cookie valid.");
        }

        await page.evaluateOnNewDocument((t) => {
            const formattedToken = t.startsWith('"') ? t : `"${t}"`;
            try { window.localStorage.setItem('token', formattedToken); } catch (e) {}
        }, token);

        logInfo("Membuka Discord App untuk verifikasi...");
        await page.goto("https://discord.com/channels/@me", { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
        await delay(4000);

        await page.evaluate((t) => {
            const formattedToken = t.startsWith('"') ? t : `"${t}"`;
            try { window.localStorage.setItem('token', formattedToken); } catch (e) {}
        }, token);

        logInfo("[SUKSES] Akun Discord berhasil teridentifikasi!");

        logInfo("Menuju gerbang Login Top.gg...");
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
                
                const cancelBtn = btns.find(b => {
                    const txt = (b.innerText || '').toLowerCase();
                    return txt === 'cancel' || txt === 'batal';
                });
                if (cancelBtn && cancelBtn.nextElementSibling) {
                    cancelBtn.nextElementSibling.click();
                    return true;
                }
                return false;
            });

            if (authClicked) {
                logInfo("Tombol Otorisasi diklik! Menunggu dialihkan...");
                await page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 }).catch(()=>{});
                await delay(4000);
            } else {
                logInfo("Gagal menemukan Otorisasi. Melanjutkan...");
            }
        } else {
            logInfo("Tidak dilempar ke Otorisasi.");
        }

        logInfo("Membuka halaman Vote...");
        await page.goto(`https://top.gg/bot/${BOT_ID}/vote`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(()=>{});
        
        logInfo("⏳ Menunggu delay 15 detik...");
        await delay(15000);
        await solveTurnstile(page);
        
        await page.evaluate(() => window.scrollBy(0, 800)); 
        await delay(2000);

        logInfo("Mencari tombol Vote...");
        
        let voteResult = await page.evaluate(() => {
            const bodyText = document.body.innerText.toLowerCase();
            if (bodyText.includes("you have already voted") || bodyText.includes("already voted")) return "already";
            
            const btns = Array.from(document.querySelectorAll("button, a"));
            
            const loginBtn = btns.find(b => (b.innerText || '').toLowerCase().includes("login with discord"));
            if (loginBtn) return "not_logged_in";

            const voteBtn = btns.find(el => {
                const text = (el.innerText || '').trim().toLowerCase();
                return text === "vote" || text === "vote!" || text === "vote for bot";
            });

            if (voteBtn && !voteBtn.disabled) { 
                voteBtn.click(); 
                return "clicked"; 
            }

            const btnTexts = btns.map(b => (b.innerText || '').trim()).filter(t => t.length > 0 && t.length < 30); 
            return `failed_debug:[ ${btnTexts.join(" | ")} ]`;
        });

        if (voteResult === "clicked") {
            logInfo("Tombol Vote ditekan! Menunggu server Top.gg (8 detik)...");
            await delay(8000); 
            
            const verifySuccess = await page.evaluate(() => {
                const bodyText = document.body.innerText.toLowerCase();
                if (bodyText.includes("thank you for voting") || bodyText.includes("already voted") || bodyText.includes("you have already voted")) {
                    return true;
                }
                return false;
            });

            if (verifySuccess) {
                voteResult = "voted";
            } else {
                voteResult = "click_failed_by_server";
            }
        }

        if (voteResult === "voted") {
            logInfo(`[SUKSES] BERHASIL VOTE! 🎉`);
        } else if (voteResult === "already") {
            logInfo(`[INFO] Akun ini sudah pernah vote sebelumnya (Cooldown aktif).`);
        } else if (voteResult === "not_logged_in") {
            logInfo(`[GAGAL] Top.gg masih meminta 'Login with Discord'.`);
        } else if (voteResult === "click_failed_by_server") {
            logInfo(`[GAGAL] Server Top.gg mengabaikan klik.`);
        } else {
            logInfo(`[GAGAL] Teks terlihat: ${voteResult.replace('failed_debug:', '')}`);
        }

        return voteResult; 

    } catch (err) {
        logInfo(`Terjadi kesalahan sistem: ${err.message}`);
        return "error";
    } finally {
        if (browser) await browser.close();
    }
}

async function runContinuous() {
    logInfo(`Mempersiapkan sistem 24/7 (Real-Time Storage) untuk ${listToken.length} akun...`);
    
    const accounts = listToken.map((token, i) => {
        let formattedCookie = [];
        if (listCookie[i]) {
            try { formattedCookie = JSON.parse(listCookie[i]); } 
            catch (e) { logInfo(`[WARNING] Cookie baris ke-${i+1} tidak valid.`); }
        }
        return {
            token: token,
            cookie: formattedCookie,
            index: i
        };
    });

    while (true) {
        let isProcessing = false;
        const now = Date.now();
        
        // Selalu muat ulang jadwal dari file json setiap putaran
        const schedule = loadSchedule();

        for (let i = 0; i < accounts.length; i++) {
            const acc = accounts[i];
            
            // Cek jadwal di database lokal, jika tidak ada, default ke 0 (langsung eksekusi)
            const nextVoteTime = schedule[acc.index] || 0;
            
            if (now >= nextVoteTime) {
                isProcessing = true;
                
                const result = await startVote(acc.token, acc.cookie, acc.index);
                
                let newTime = 0;
                if (result === "voted" || result === "already") {
                    // Setel ke 12 JAM dari waktu sekarang
                    newTime = Date.now() + (12 * 60 * 60 * 1000) + (2 * 60 * 1000); 
                    logInfo(`[JADWAL] Disimpan: Akun ke-${acc.index + 1} Selesai. Menunggu 12 jam.\n`);
                } else {
                    // Setel ke 5 MENIT dari waktu sekarang jika gagal
                    newTime = Date.now() + (5 * 60 * 1000);
                    logInfo(`[JADWAL] Disimpan: Akun ke-${acc.index + 1} Gagal. Akan mencoba kembali dalam 5 menit.\n`);
                }
                
                // Simpan jadwal baru langsung ke file schedule.json
                schedule[acc.index] = newTime;
                saveSchedule(schedule);
                
                await delay(5000); 
            }
        }

        if (!isProcessing) {
            // Jika semua akun sedang dalam masa tunggu, bot akan beristirahat selama 1 menit lalu mengecek file jadwal lagi.
            await delay(60000); 
        }
    }
}

runContinuous();
