FROM node:12.7-alpine

WORKDIR /srv

RUN apk update && apk upgrade && apk add --no-cache git openssh

RUN git clone https://github.com/larvit/urltocmd.git /srv

RUN npm i

CMD [ "npm", "start" ]