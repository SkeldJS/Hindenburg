# Use the node image and install yarn with npm
FROM node:14

# Copy the project to the container
RUN mkdir /Hindenburg
WORKDIR /Hindenburg
COPY . /Hindenburg

EXPOSE 22023

# Install dependencies and setup Hindenburg
RUN yarn
RUN yarn setup

# Build the project
RUN yarn build

# Start the server
CMD ["yarn", "start"]
