# Container image for hosting the game (see INTERNET.md, "Variante C: Hosting").
# One process serves the web page and the WebSocket on $PORT (default 3000).
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
