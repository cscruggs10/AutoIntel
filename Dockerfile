# Use Playwright's official image which has all browser dependencies
FROM mcr.microsoft.com/playwright:v1.58.0-noble

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (skip postinstall since browsers are already in image)
RUN npm ci --ignore-scripts

# Copy application code
COPY . .

# Expose port
EXPOSE 8080

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Start the server
CMD ["npm", "start"]
