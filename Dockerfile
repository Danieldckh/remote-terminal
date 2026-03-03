FROM node:20-alpine
WORKDIR /app
COPY relay/package*.json ./
RUN npm install --omit=dev
COPY relay/ .
EXPOSE 3000
CMD ["node", "server.js"]
