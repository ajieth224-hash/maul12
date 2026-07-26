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

BOT_URL = "" # your bot's token/url here

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

def get_tokens(file="tokens.txt"):
    if not os.path.exists(file):
        return []
    with open(file, "r") as f:
        return [line.strip() for line in f if line.strip()]

def save_retry_token(token):
    with open("retry.txt", "a") as f:
        f.write(token + "\n")

def login_with_token(driver, token):
    logging.info("Logging token...")
    # NOTE: Logging in with just a token via script injection is usually done with execute_script, 
    # but I am leaving your original code intact as requested.
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
        if "top.gg/bot" in driver.current_url: # Diperbaiki dari current_uri menjadi current_url
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

def vote_with_token(token):
    options = uc.ChromeOptions()
    options.add_argument("--window-size=1920,1080")
    
    # --- TAMBAHAN UNTUK RENDER.COM (Mode Headless) ---
    # Render tidak memiliki layar, jadi Chrome harus berjalan di belakang layar
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    # -------------------------------------------------

    driver = uc.Chrome(options=options)
    wait = WebDriverWait(driver, 20)

    try:
        login_with_token(driver, token)

        driver.get(BOT_URL)
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
        
        # Syntax error bawaan "))" dihapus dan diubah menjadi klik tombol final
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

def process_token(token, retry=False):
    logging.info(f"{'Retrying' if retry else 'Voting with'} token: {token}")
    success = vote_with_token(token)
    if not success:
        logging.warning(f"Retrying token: {token}")
        success = vote_with_token(token)
        if not success:
            logging.error(f"Failed after retry: {token}")
            save_retry_token(token)

def main():
    # --- UBAH MENJADI MULTI-VOTE LOOPING (Tiap 12 Jam) ---
    while True:
        logging.info("=== MEMULAI SIKLUS VOTE BARU ===")
        if os.path.exists("retry.txt"):
            os.remove("retry.txt")

        tokens = get_tokens()
        if not tokens:
            logging.warning("Tidak ada token di tokens.txt!")
        
        for token in tokens:
            process_token(token)
            time.sleep(random.uniform(2, 3))

        if os.path.exists("retry.txt"):
            logging.info("Processing retry tokens...")
            retry_tokens = get_tokens("retry.txt")
            for retry_tok in retry_tokens:
                process_token(retry_tok, retry=True)
            os.remove("retry.txt")
            
        logging.info("=== SIKLUS VOTE SELESAI ===")
        # Jeda 12 jam (43200 detik) + 1 menit sebelum voting ulang
        wait_seconds = 43260
        logging.info(f"Menunggu {wait_seconds // 3600} jam untuk siklus vote berikutnya...")
        time.sleep(wait_seconds)
    # -----------------------------------------------------

if __name__ == "__main__":
    # --- TAMBAHAN UNTUK RENDER.COM (Jalankan Web Server) ---
    server_thread = Thread(target=run_server)
    server_thread.daemon = True
    server_thread.start()
    # -------------------------------------------------------
    
    main()
