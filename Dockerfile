FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node app/package.json ./package.json
COPY --chown=node:node app/server.js ./server.js

USER node
EXPOSE 3000
CMD ["node", "server.js"]
