# Jeden obraz na hosting: backend podaje API i zbudowany frontend spod tego samego adresu. (DamianTchorzewski_72206)
FROM node:24-alpine AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend ./
RUN VITE_BASE=/ npm run build

FROM node:24-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci
COPY backend ./
RUN npx prisma generate && npm run build
COPY --from=frontend /frontend/dist ./public
COPY docker/start.sh ./start.sh
ENV NODE_ENV=production FRONTEND_DIST=public SEED_ONLY_IF_EMPTY=true
USER node
CMD ["sh", "./start.sh"]
