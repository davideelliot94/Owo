FROM openwhisk/action-nodejs-v10:latest

ARG PY=false
ARG NET=false
ARG RUBY=false
ARG SWIFT=false
ARG RUST=false
ARG PHP=false
ARG GO=false
ARG BALLERINA=false
ARG JAVA=false

COPY . .

RUN apt-get update
RUN apt install apt-utils -y

RUN sh /nodejsAction/envInstaller.sh ${PY} ${NET} ${RUBY} ${SWIFT} ${RUST} ${PHP} ${GO} ${BALLERINA} ${JAVA}
RUN rm -R /nodejsAction/envInstaller.sh
