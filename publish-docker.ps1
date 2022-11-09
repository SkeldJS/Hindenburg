$tag = ((git describe --tags --abbrev=0) -join '')

docker buildx create --use
docker buildx build --push --platform linux/arm64/v8 --tag hindenburg/hindenburg:latest --tag hindenburg/hindenburg:$tag .
