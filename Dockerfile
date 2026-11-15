# Stage 1: Build ResQCore Web Command Center
FROM node:20-alpine AS web-builder
WORKDIR /build/resqcore

COPY resqcore/package*.json ./
RUN npm ci

COPY resqcore/ ./

ARG VITE_API_BASE_URL=""
ARG VITE_COMMAND_TOKEN=""
ARG VITE_GOOGLE_MAPS_API_KEY=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_COMMAND_TOKEN=${VITE_COMMAND_TOKEN}
ENV VITE_GOOGLE_MAPS_API_KEY=${VITE_GOOGLE_MAPS_API_KEY}

RUN npm run build

# Stage 2: Production Backend + Static Web Bundle
FROM node:20-alpine AS runtime
WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=5000

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY --from=web-builder /build/resqcore/dist ./public

EXPOSE 5000

CMD ["node", "server.js"]
