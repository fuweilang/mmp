FROM node:24-bookworm AS build
# Build context excludes .git, so the client build cannot read the commit itself.
ARG MMP_CLIENT_COMMIT_HASH
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 MMP_CLIENT_COMMIT_HASH=${MMP_CLIENT_COMMIT_HASH}
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update && apt-get install -y --no-install-recommends python3 build-essential git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm config set registry https://registry.npmmirror.com \
  && npm install -g pnpm@11.28.5 \
  && pnpm config set registry https://registry.npmmirror.com
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ENV MMP_BUILD_TARGET=web
RUN pnpm run build:artifacts
RUN pnpm exec tsdown --no-config scripts/serve-ground-web.ts --format esm --platform node --out-dir runtime --no-dts --no-clean
# Runtime is built JavaScript plus assets and package manifests, not a source checkout.
RUN find packages vendor apps -type d \( -name src -o -name tests -o -name .desktop-build \) -prune -exec rm -rf '{}' + \
 && rm -rf scripts .agents docs website snapshots benchmarks infra .github \
 && find packages vendor apps -type f \( -name '*.map' -o -name '*.tsbuildinfo' \) -delete
FROM docker:28-cli AS dockercli
FROM node:24-bookworm-slim
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources \
  && apt-get update && apt-get install -y --no-install-recommends ca-certificates git python3 bash procps && rm -rf /var/lib/apt/lists/*
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /app
COPY --from=build /app /app
ENV MMP_WEB_BUILT_RUNTIME=1 MMP_HOME=/home/mmp HOME=/home/mmp
CMD ["node", "runtime/serve-ground-web.mjs", "--port", "33080", "--no-open"]
