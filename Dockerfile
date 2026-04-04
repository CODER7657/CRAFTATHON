FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies (build-essential needed for some python packages like PyNaCl)
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project source code
COPY . .

# Expose the API port
EXPOSE 8010

# Default command (will be overridden by docker-compose for workers)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
