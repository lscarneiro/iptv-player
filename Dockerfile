# Minimal Dockerfile for IPTV Player
FROM nginx:alpine

# Copy the application files to nginx html directory
COPY src/ /usr/share/nginx/html/

# Expose port 80
EXPOSE 80

# The default nginx CMD will start nginx and serve the files

