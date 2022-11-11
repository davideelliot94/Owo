FROM node:latest

ENV API_HOST=""
ENV METRICS_ENDPOINT=""
ENV ENVIRONMENT=""

COPY . /owo

RUN rm -R /owo/kubes

WORKDIR /owo/src

#VOLUME  "../cli" 

RUN npm install --production
RUN apt-get update
RUN apt-get install docker.io -y

EXPOSE 4000

CMD sh bin/script.sh