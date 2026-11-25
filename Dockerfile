FROM node:24-alpine AS build
WORKDIR /workspace
ARG VITE_GRAPHQL_URL
ARG VITE_OIDC_ISSUER
ARG VITE_OIDC_CLIENT_ID
ARG VITE_OIDC_REDIRECT_URI
ENV VITE_GRAPHQL_URL=${VITE_GRAPHQL_URL} \
    VITE_OIDC_ISSUER=${VITE_OIDC_ISSUER} \
    VITE_OIDC_CLIENT_ID=${VITE_OIDC_CLIENT_ID} \
    VITE_OIDC_REDIRECT_URI=${VITE_OIDC_REDIRECT_URI}
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
ENV PORT=8080
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --chmod=755 runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
USER root
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-runtime-config.sh \
    && chmod 755 /docker-entrypoint.d/40-runtime-config.sh
USER 101
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
