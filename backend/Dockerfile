# Obraz backendu i atrap partnerów. Zależności deweloperskie zostają, bo migracje i seed używają Prisma CLI i tsx. (DamianTchorzewski_72206)
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
