# Codeniac em um servidor (nuvem ou mini PC sempre ligado).
# docker build -t codeniac . && docker run -d -p 3000:3000 -v codeniac-dados:/data --name codeniac codeniac
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
ENV NODE_ENV=production DATA_DIR=/data PORT=3000 HOST=0.0.0.0 TRUST_PROXY=1
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server/index.js"]
