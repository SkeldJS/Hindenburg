FROM node:14.18.1-alpine3.14

RUN apk add bash
RUN apk add git

RUN mkdir /HConfig && mkdir /HPlugins && mkdir /Hindenburg
WORKDIR /Hindenburg
COPY . /Hindenburg

EXPOSE 22023

ENV HINDENBURG_PLUGINS /HPlugins
ENV HINDENBURG_CONFIG /HConfig/config.json

RUN yarn
RUN yarn build

ENTRYPOINT ["yarn", "start"]
