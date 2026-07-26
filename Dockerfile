# Menggunakan Python versi 3.11
FROM python:3.11-slim

# Menginstal dependensi sistem dan mengunduh Google Chrome langsung
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    curl \
    && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y ./google-chrome-stable_current_amd64.deb \
    && rm google-chrome-stable_current_amd64.deb \
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
