FROM node:4-slim

RUN wget -O /bin/dumb-init https://github.com/Yelp/dumb-init/releases/download/v1.0.1/dumb-init_1.0.1_amd64 && \
    chmod +x /bin/dumb-init && \
    mkdir /app 

EXPOSE 8080
CMD ["dumb-init", "node", "/app/docker.js"]


COPY *.js* /app/
RUN cd /app && npm install 
