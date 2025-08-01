# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Copy Prisma schema
COPY prisma ./prisma

# Generate Prisma Client
RUN npx prisma generate

# Copy source files
COPY . .

# Build the project
RUN npm run build

# Stage 2: Runtime
FROM node:18-alpine AS runner

WORKDIR /usr/src/app

# Copy only built files and node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./

# Set environment variables (overridden by docker-compose.override.yml)
ENV NODE_ENV=production

# Expose port (NestJS default is 3000)
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]
