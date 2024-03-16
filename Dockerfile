# Dockerfile-order-service

FROM node:18

WORKDIR /order-service

COPY ./package*.json ./
RUN npm install

COPY . .

CMD npm run typechain-build && npm run start-prod