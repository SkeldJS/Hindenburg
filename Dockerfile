FROM node:14.18.1-alpine3.14

ENV NODE_VERSION 14.18.1
ENV PATH /usr/local/bin:$PATH
ENV LANG C.UTF-8

# Copy the project to the container
RUN mkdir /Hindenburg
WORKDIR /Hindenburg
COPY . /Hindenburg

EXPOSE 22023/udp

# Install dependencies and setup Hindenburg
RUN yarn && yarn build

# Start the server
ENV HINDENBURG_PLUGINS /Hindenburg/plugins
ENV HINDENBURG_CONFIG /Hindenburg/config.json
CMD ["yarn", "start"]
