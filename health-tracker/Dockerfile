# Deployable static image
FROM nginx:alpine

# Copy app
COPY . /usr/share/nginx/html

# Default NGINX config already serves from /usr/share/nginx/html
EXPOSE 80

HEALTHCHECK CMD wget --spider -q http://localhost/ || exit 1