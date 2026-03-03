FROM node:20-alpine
WORKDIR /app
COPY relay/package*.json ./
RUN npm ci --production
COPY relay/ .
EXPOSE 3000
CMD ["node", "server.js"]
