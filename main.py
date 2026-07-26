import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time
import logging
import random
import os

# --- TAMBAHAN UNTUK RENDER.COM (Web Server) ---
from flask import Flask
from threading import Thread

app = Flask(__name__)

@app.route('/')
def home():
    return "Top.gg Autovoter is Running!"

def run_server():
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)
# ----------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

def get_tokens(file="tokens.txt"):
    if not os.path.exists(file):
        return []
    with open(file, "r") as f:
        return [line.strip() for line in f if line.strip()]

def get_bot_urls(file="bots.txt"):
    if not os.path.exists(file):
        return []
    with open(file, "r") as f:
        return [line.strip() for line in f if line.strip()]

def save_retry_token(token):
    with open("retry.txt", "a") as f:
        f.write(token + "\n")

def login_with_token(driver, token):
    logging.info("Logging token...")
    # Anda bisa memodifikasi bagian ini jika ingin injeksi token via LocalStorage
    driver.get("https://discord.com/login")
    time.sleep(3)

def handle_authorization(driver, wait):
    zoom_and_scroll_to_authorize(driver)
    scroll_modal_to_bottom(driver)

    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            auth_button = wait.until(EC.element_to_be_clickable(
                (By.XPATH, "//button[contains(., 'Authorize')]")
            ))
            auth_button.click()
            logging.info(f"Authorization button clicked (Attempt {attempt + 1})")
            time.sleep(3)
            return True
        except Exception as e:
            logging.warning(f"Attempt {attempt + 1} failed: {e}")
            scroll_modal_to_bottom(driver)
            time.sleep(2)

    logging.warning("Authorization button could not be clicked automatically.")
    logging.info("Waiting for manual authorization (up to 30 seconds)...")

    for _ in range(30):
        if "top.gg/bot" in driver.current_url: 
            logging.info("Manual authorization detected. Continuing...")
            return True
        time.sleep(1)

    logging.error("Manual authorization not detected. Step failed.")
    return False

def scroll_modal_to_bottom(driver):
    script = """
    let modal = document.querySelector('[class*="scroller"]');
    if (modal) {
        modal.scrollTop = modal.scrollHeight;
    }
    """
    driver.execute_script(script)
    logging.info("Scrolled OAuth modal to bottom")
    time.sleep(1)

def zoom_and_scroll_to_authorize(driver):
    driver.execute_script("document.body.style.zoom='0.5'")
    time.sleep(1)
    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(1)
    logging.info("Zoomed and scrolled to bottom to reveal authorize button")

def vote_with_token(token, bot_url):
    options = uc.ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    
    # --- PENGATURAN KHUSUS DOCKER & RENDER.COM ---
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    
    # Menunjuk langsung ke aplikasi Chromium bawaan OS
    options.binary_location = "/usr/bin/chromium"
    
    # Memaksa uc.Chrome menggunakan driver bawaan OS agar versinya tidak bentrok
    driver = uc.Chrome(options=options, driver_executable_path="/usr/bin/chromedriver")
    # ---------------------------------------------
    
    wait = WebDriverWait(driver, 20)

    try:
        login_with_token(driver, token)

        driver.get(bot_url)
        time.sleep(3)

        try:
            wait.until(EC.element_to_be_clickable((By.XPATH, "//button[text()='Login']"))).click()
            time.sleep(2)
        except:
            pass

        for _ in range(10):
            if "discord.com/oauth2" in driver.current_url:
                break
            time.sleep(1)

        for _ in range(20):
            if "discord.com/oauth2" in driver.current_url:
                logging.info("OAuth page detected")
                break
            time.sleep(0.5)

        if not handle_authorization(driver, wait):
            logging.error("Failed to complete authorization")
            return False

        for _ in range(10):
            if "top.gg/bot" in driver.current_url:
                break
            time.sleep(0.5)

        vote_link = wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//a[contains(@href, '/vote')]")
        ))
        vote_link.click()
        time.sleep(3)
        
        vote_button = wait.until(EC.element_to_be_clickable(
            (By.XPATH, "//button[contains(text(), 'Vote')]")
        ))
        vote_button.click()
        
        logging.info("Voted Successfully!")
        return True

    except Exception as e:
        logging.error(f"Error: {e}")
        return False
    finally:
        time.sleep(5)
        driver.quit()

def process_token(token, bot_url, retry=False):
    # Menyembunyikan sebagian token di log agar aman
    safe_token = f"{token[:15]}..." if len(token) > 15 else token
    logging.info(f"{'Retrying' if retry else 'Voting with'} token: {safe_token} untuk {bot_url}")
    
    success = vote_with_token(token, bot_url)
    if not success:
        logging.warning(f"Retrying token...")
        success = vote_with_token(token, bot_url)
        if not success:
            logging.error(f"Failed after retry.")
            save_retry_token(token)

def main():
    while True:
        logging.info("=== MEMULAI SIKLUS VOTE BARU ===")
        
        bot_urls = get_bot_urls()
        if not bot_urls:
            logging.error("File bots.txt kosong atau tidak ditemukan! Menunggu 1 menit...")
            time.sleep(60)
            continue
            
        tokens = get_tokens()
        if not tokens:
            logging.warning("Tidak ada token di tokens.txt!")
        
        if os.path.exists("retry.txt"):
            os.remove("retry.txt")

        # Looping 1: Eksekusi setiap Bot URL
        for bot_url in bot_urls:
            logging.info(f"\n---> MEMPROSES BOT: {bot_url} <---")
            
            # Looping 2: Gunakan semua token untuk Bot tersebut
            for token in tokens:
                process_token(token, bot_url)
                time.sleep(random.uniform(2, 3))

        # Coba ulang token yang gagal
        if os.path.exists("retry.txt"):
            logging.info("\nProcessing retry tokens...")
            retry_tokens = get_tokens("retry.txt")
            
            for retry_tok in retry_tokens:
                process_token(retry_tok, bot_urls[0], retry=True)
            os.remove("retry.txt")
            
        logging.info("\n=== SIKLUS VOTE UNTUK SEMUA BOT SELESAI ===")
        
        # Jeda 12 Jam + 1 Menit untuk cooldown Top.gg
        wait_seconds = 43260
        logging.info(f"Menunggu {wait_seconds // 3600} jam untuk siklus vote berikutnya...")
        time.sleep(wait_seconds)

if __name__ == "__main__":
    # Jalankan server palsu agar Render.com tidak mematikan aplikasi
    server_thread = Thread(target=run_server)
    server_thread.daemon = True
    server_thread.start()
    
    main()
