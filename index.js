const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const axios = require('axios');
const fs = require('fs');
const express = require('express');
const cron = require('node-cron');

const listToken = fs.existsSync('tokens.txt') 
    ? fs.readFileSync('tokens.txt', 'utf8').split('\n').map(t => t.trim()).filter(Boolean) 
    : [];

const listCookie = fs.existsSync('cookies.txt') 
    ? fs.readFileSync('cookies.txt', 'utf8').split('\n').map(c => c.trim()).filter(Boolean) 
    : [];

const BOT_ID = '519287796549156864'; 
const YESCAPTCHA_TOKEN = '4833cd9be06f143f76fc531a5312404bbdb09dc0100535'; 

const delay = (ms) => new Promise(res => setTimeout(res, ms));

async function logInfo(msg) { 
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
    console.log(`[${now}] [Bot] ${msg}`); 
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

async function startVote(token, cookies, accountIndex) {
    const shortT = token ? (token.slice(0, 5) + "...") : "KOSONG";
    logInfo(`\n--- Memulai akun ke-${accountIndex + 1}: ${shortT} ---`);

    if (!token) {
        logInfo("[GAGAL] Token tidak ditemukan untuk akun ini.");
        return;
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

        // === SMART WAIT: LOOP PENCARIAN TOMBOL VOTE ===
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
                break; // Keluar dari loop jika tombol ditemukan atau akun sudah vote
            }

            logInfo(`[TUNGGU] Iklan masih berjalan, cek lagi dalam 5 detik... (Percobaan ${attempt}/8)`);
            await delay(5000); // Jeda 5 detik sebelum cek ulang layar
        }
        // === BATAS SMART WAIT ===

        if (btnData.status === "found") {
            logInfo("Tombol ditemukan! Melakukan klik mouse nyata...");
            await delay(1500); 
            await page.mouse.click(btnData.x, btnData.y); 
            await delay(8000); // Tunggu respons server Top.gg setelah klik

            const isSuccess = await page.evaluate(() => {
                const text = document.body.innerText.toLowerCase();
                return text.includes("thank you for voting") || text.includes("thanks for voting") || text.includes("already voted") || text.includes("successfully voted"); 
            });

            if (isSuccess) {
                logInfo(`[SUKSES] BERHASIL VOTE! 🎉`);
            } else {
                logInfo(`[GAGAL] Tombol diklik tapi server menolak vote. (Kemungkinan Anti-Bot)`);
            }

        } else if (btnData.status === "already") {
            logInfo(`[INFO] Sudah pernah vote.`);
        } else {
            logInfo(`[GAGAL] Waktu habis. Tombol Vote tidak muncul setelah ditunggu 40 detik.`);
        }

    } catch (err) {
        logInfo(`Kesalahan sistem: ${err.message}`);
    } finally {
        if (browser) await browser.close();
    }
}

async function runAll() {
    if (listToken.length === 0) {
        logInfo("File tokens.txt kosong atau tidak ditemukan.");
        return;
    }
    
    logInfo(`Memulai siklus vote untuk ${listToken.length} akun...`);
    for (let i = 0; i < listToken.length; i++) {
        let formattedCookie = [];
        if (listCookie[i]) {
            try { formattedCookie = JSON.parse(listCookie[i]); } catch (e) {}
        }
        await startVote(listToken[i], formattedCookie, i);
        await delay(5000); 
    }
    logInfo("Siklus vote selesai. Menunggu jadwal berikutnya...");
}

// === PENGATURAN SERVER & PENJADWALAN ===

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot Auto-Vote aktif! Menunggu jadwal eksekusi selanjutnya.');
});

app.listen(PORT, () => {
    logInfo(`Web server menyala di port ${PORT}`);
    
    runAll();

    cron.schedule('0 */12 * * *', () => {
        logInfo("⏰ Jadwal 12 jam tercapai! Memulai siklus auto-vote...");
        runAll();
    });
});
