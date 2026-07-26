# Menggunakan Python versi 3.11
FROM python:3.11-slim

# Menginstal Chromium dan Chromium-Driver bawaan OS yang dijamin cocok versinya
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
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
