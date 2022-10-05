FROM node:latest

ENV API_HOST=""
ENV METRICS_ENDPOINT=""
ENV ENVIRONMENT=""

COPY . /faas-optimizer

WORKDIR /faas-optimizer/src

VOLUME  "/owo/cli" 

RUN npm install --production
RUN apt-get install docker.io -y

EXPOSE 4000

CMD sh bin/script.sh