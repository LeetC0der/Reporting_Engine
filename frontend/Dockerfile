FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json ./frontend/
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG VITE_API_BASE_URL=http://localhost:4000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build -w frontend

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
