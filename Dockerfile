FROM node:24.21.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ src/
COPY tsconfig.json ./
RUN npm run build

FROM node:24.21.0-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/dist/ dist/
COPY config/ config/
# SIGTERM is handled in src/mcp-server.ts, so no init is needed as PID 1
CMD ["node", "dist/mcp-server.js"]
