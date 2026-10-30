FROM node:22-alpine AS js-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY agent/package.json agent/package.json
RUN npm ci --no-audit --no-fund
COPY frontend/ frontend/
COPY agent/ agent/
RUN npm run build --workspace frontend && npm run build --workspace agent

FROM golang:1.22-alpine AS go-build
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /app/nexo-assist .

FROM node:22-alpine
RUN addgroup -S nexo && adduser -S nexo -G nexo && apk add --no-cache ca-certificates tzdata
WORKDIR /app/backend
COPY --from=go-build /app/nexo-assist ./nexo-assist
COPY db/ /app/db/
COPY --from=js-build /app/node_modules /app/node_modules
COPY --from=js-build /app/agent/package.json /app/agent/package.json
COPY --from=js-build /app/agent/dist /app/agent/dist
COPY --from=js-build /app/agent/.context /app/agent/.context
COPY --from=js-build /app/frontend/dist /app/frontend/dist
ENV STATIC_DIR=/app/frontend/dist
USER nexo
EXPOSE 8080
CMD ["sh", "-c", "export GOOGLE_API_KEY=\"${GOOGLE_API_KEY:-${GEMINI_API_KEY:-}}\"; (cd /app/agent && node dist/server.js) & exec /app/backend/nexo-assist"]
