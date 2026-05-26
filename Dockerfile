FROM node:20-alpine AS build
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=development

COPY package.json package-lock.json* ./
RUN npm ci && npm cache clean --force

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS production
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/build ./build
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma

RUN npx prisma generate

EXPOSE 3000
CMD ["npm", "run", "docker-start"]
