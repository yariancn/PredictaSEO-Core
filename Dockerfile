FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=development

COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

COPY . .
RUN npm run build

FROM node:20-alpine AS production
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/extensions ./extensions

EXPOSE 3000
CMD ["npm", "run", "docker-start"]
