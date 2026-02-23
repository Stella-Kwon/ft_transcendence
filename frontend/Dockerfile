FROM node:20-alpine3.21

RUN apk add --no-cache openssl

WORKDIR /transcendence

# Default API URL for build (use http so Chrome works without cert; override via build-arg if needed)
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./

RUN npm install

COPY . .

RUN chmod +x entrypoint.sh

EXPOSE 5173

ENTRYPOINT ["sh", "entrypoint.sh"]

CMD ["npm", "start"]