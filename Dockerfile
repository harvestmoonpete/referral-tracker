FROM node:24.14.0-alpine3.23 AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
FROM dependencies AS api
ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm","start"]
FROM dependencies AS build
ENV VITE_API_MODE=http
RUN npm run build
FROM nginx:1.28.2-alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
