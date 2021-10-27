docker buildx build \
    --push \
    --platform linux/amd64,linux/arm/v7,linux/arm64/v8,linux/arm/v6 \
    --tag hindenburg/hindenburg:latest \
    --tag hindenburg/hindenburg:`git describe --tags --abbrev=0` .
