# Menggunakan Python versi 3.11 (agar distutils tidak error)
FROM python:3.11-slim

# Menginstal dependensi sistem dan Google Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    curl \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Menyiapkan folder kerja di dalam server
WORKDIR /app

# Meng-copy file requirements dan menginstalnya
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Meng-copy semua file Anda (main.py, tokens.txt, bots.txt)
COPY . .

# Mengeksekusi skrip utama
CMD ["python", "main.py"]
