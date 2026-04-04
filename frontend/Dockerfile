FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies explicitly bypassing cache for dev
RUN npm install

# Copy source code 
COPY . .

# Expose port
EXPOSE 3000

# Start dev server with hot reloading
CMD ["npm", "run", "dev"]
