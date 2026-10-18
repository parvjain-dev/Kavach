FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY src ./src
COPY public ./public
# Cloud Run injects PORT (8080); server.js reads it.
EXPOSE 8080
USER node
CMD ["node", "server.js"]
