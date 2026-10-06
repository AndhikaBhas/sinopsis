FROM node:25-alpine3.21 AS development-dependencies-env
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:25-alpine3.21 AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:25-alpine3.21 AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
RUN npm run build

FROM node:25-alpine3.21

COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
COPY --from=build-env /app/prisma/generated /app/prisma/generated
COPY ./prisma /app/prisma
COPY ./prisma.config.ts /app/
COPY ./server.js ./worker.js /app/
COPY ./public /app/public

# Create temp directory for audio uploads
RUN mkdir -p /tmp/sinopsis-uploads

WORKDIR /app
CMD ["npm", "run", "start"]