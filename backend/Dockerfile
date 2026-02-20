FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w backend

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm ci --omit=dev
COPY --from=build /app/backend/dist ./backend/dist
RUN mkdir -p /app/backend/data
WORKDIR /app/backend
EXPOSE 4000
CMD ["node", "dist/server.js"]
