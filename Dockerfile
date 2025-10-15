FROM node:14.18.1-alpine3.14

RUN apk add bash
RUN apk add git

RUN mkdir /HConfig && mkdir /HPlugins && mkdir /Waterway
WORKDIR /Waterway
COPY . /Waterway

EXPOSE 22023

ENV WATERWAY_PLUGINS /HPlugins
ENV WATERWAY_CONFIG /HConfig/config.json

RUN yarn
RUN yarn build

ENTRYPOINT ["yarn", "start"]
