docker buildx build \
    --push \
    --platform linux/amd64,linux/arm/v7,linux/arm64/v8,linux/arm/v6 \
    --tag waterway/waterway:latest \
    --tag waterway/waterway:`git describe --tags --abbrev=0` .
