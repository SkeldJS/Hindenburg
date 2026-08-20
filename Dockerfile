# ── Stage 1: Build SkeldJS from source ──
FROM node:22-alpine AS skeldjs-builder

WORKDIR /skeldjs
RUN apk add --no-cache git

# Clone the SkeldJS fork — uses default branch
# To force re-clone: docker build --build-arg CACHEBUST=$(date +%s) .
# To specify a branch:  docker build --build-arg SKELDJS_REF=my-branch .
ARG SKELDJS_REPO=https://github.com/Empostor/SkeldJS
ARG SKELDJS_REF=
ARG CACHEBUST=1
RUN if [ -n "${SKELDJS_REF}" ]; then \
        git clone --depth 1 --branch "${SKELDJS_REF}" ${SKELDJS_REPO} . ; \
    else \
        git clone --depth 1 ${SKELDJS_REPO} . ; \
    fi

# Install dependencies & build all packages
RUN corepack enable && yarn install
RUN yarn build-all

# ── Stage 2: Build Waterway ──
FROM node:22-alpine AS builder

WORKDIR /app

# Copy Waterway source
COPY package.json tsconfig.json .yarnrc.yml ./
COPY .yarn/ .yarn/
COPY bin/ bin/
COPY src/ src/

# Enable yarn, install only third-party deps (SkeldJS from npm as placeholder)
RUN corepack enable
RUN yarn install

# Overwrite npm SkeldJS with locally-built packages
COPY --from=skeldjs-builder /skeldjs/packages/client/dist    /app/node_modules/@skeldjs/au-client/dist
COPY --from=skeldjs-builder /skeldjs/packages/client/package.json /app/node_modules/@skeldjs/au-client/
COPY --from=skeldjs-builder /skeldjs/packages/constant/dist  /app/node_modules/@skeldjs/au-constants/dist
COPY --from=skeldjs-builder /skeldjs/packages/constant/package.json /app/node_modules/@skeldjs/au-constants/
COPY --from=skeldjs-builder /skeldjs/packages/core/dist      /app/node_modules/@skeldjs/au-core/dist
COPY --from=skeldjs-builder /skeldjs/packages/core/package.json /app/node_modules/@skeldjs/au-core/
COPY --from=skeldjs-builder /skeldjs/packages/protocol/dist  /app/node_modules/@skeldjs/au-protocol/dist
COPY --from=skeldjs-builder /skeldjs/packages/protocol/package.json /app/node_modules/@skeldjs/au-protocol/
COPY --from=skeldjs-builder /skeldjs/packages/text/dist      /app/node_modules/@skeldjs/au-text/dist
COPY --from=skeldjs-builder /skeldjs/packages/text/package.json /app/node_modules/@skeldjs/au-text/
COPY --from=skeldjs-builder /skeldjs/packages/events/dist    /app/node_modules/@skeldjs/events/dist
COPY --from=skeldjs-builder /skeldjs/packages/events/package.json /app/node_modules/@skeldjs/events/
COPY --from=skeldjs-builder /skeldjs/packages/hazel/dist     /app/node_modules/@skeldjs/hazel/dist
COPY --from=skeldjs-builder /skeldjs/packages/hazel/package.json /app/node_modules/@skeldjs/hazel/

# Build Waterway with local SkeldJS
RUN yarn build

# ── Stage 3: Production image ──
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/package.json /app/

EXPOSE 22023 22123

CMD ["node", "dist/bin/bootstrap"]
