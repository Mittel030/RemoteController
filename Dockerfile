FROM node:20-alpine
WORKDIR /app
COPY ws-server/package*.json ./
RUN npm install
COPY ws-server/server.js ./
COPY public/ ./public/
EXPOSE 3000
CMD ["node", "server.js"]
