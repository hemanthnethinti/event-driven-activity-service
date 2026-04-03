FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev deps so tests can run in container)
RUN npm install

# Copy source code
COPY src ./src
COPY tests ./tests
COPY jest.config.js ./jest.config.js

# Start worker
CMD ["npm", "start"]
