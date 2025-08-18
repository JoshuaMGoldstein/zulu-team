# syntax=docker/dockerfile:1

FROM node:22-alpine
RUN mkdir /home/node/app
WORKDIR /home/node/app
COPY --chown=node:node . .
RUN npm i --omit=dev
RUN npm run build
EXPOSE 8088
CMD ["npm", "start"]
