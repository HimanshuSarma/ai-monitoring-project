# Use a light version of Node
FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y curl \
  && curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl" \
  && chmod +x kubectl \
  && mv kubectl /usr/local/bin/ \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first (for caching)
COPY package*.json ./
RUN npm install --production

# Copy the rest of the code
COPY . .

# Expose the port Server 1 listens on
EXPOSE 8000

# Start the server
CMD [ "node", "index.js" ]