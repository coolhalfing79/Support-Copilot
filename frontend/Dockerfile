# ============================================================
# Stage 1: Builder
# Install dependencies and build the Vite/React app.
# Node.js and all node_modules stay here — not in final image.
# ============================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching.
# Docker will skip npm ci if these haven't changed.
COPY package.json package-lock.json ./

RUN npm ci

# Copy source and build
COPY . .
RUN npm run build
# Output lands in /app/dist


# ============================================================
# Stage 2: Runtime
# Serve the static dist/ folder with nginx.
# Final image has zero Node.js, zero node_modules.
# ============================================================
FROM nginx:1.27-alpine AS runtime

# Remove the default nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx config (see nginx.conf alongside this Dockerfile)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]